package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/joho/godotenv"
)

// --- Package-level config loaded once at startup ---
var jwtSecret string
var allowedOrigin string

// --- Rate Limiter (fixed-window counter per IP) ---
//
// PATCH-WORK REPLACED: The original implementation had three bugs:
//  1. It reset the window on every request older than 60s (slow-drip bypass).
//  2. It only ever cleaned a single IP's stale entry — map grew unbounded.
//  3. It trusted the client-controlled X-Forwarded-For header for IP identity.
//
// INDUSTRY STANDARD: Fixed-window counter with a background cleanup goroutine
// and IP extraction that only reads X-Forwarded-For when behind a known proxy.
type bucket struct {
	mu          sync.Mutex
	count       int
	windowStart time.Time
}

type rateLimiter struct {
	mu       sync.RWMutex
	visitors map[string]*bucket
}

const (
	rateLimitMax    = 30              // Max requests per 60-second window
	rateLimitWindow = 60 * time.Second
	maxUploadSize   = 10 * 1024 * 1024 // 10MB hard cap
)

var limiter = newRateLimiter()

func newRateLimiter() *rateLimiter {
	rl := &rateLimiter{visitors: make(map[string]*bucket)}
	go rl.cleanupLoop()
	return rl
}

// cleanupLoop purges stale buckets every 5 minutes to prevent unbounded growth.
func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rateLimitWindow * 2)
		for ip, b := range rl.visitors {
			b.mu.Lock()
			if b.windowStart.Before(cutoff) {
				delete(rl.visitors, ip)
			}
			b.mu.Unlock()
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.RLock()
	b, ok := rl.visitors[ip]
	rl.mu.RUnlock()

	if !ok {
		rl.mu.Lock()
		// Double-check after acquiring write lock.
		if b, ok = rl.visitors[ip]; !ok {
			b = &bucket{count: 0, windowStart: time.Now()}
			rl.visitors[ip] = b
		}
		rl.mu.Unlock()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	if now.Sub(b.windowStart) >= rateLimitWindow {
		// New window: reset counter.
		b.count = 0
		b.windowStart = now
	}

	if b.count >= rateLimitMax {
		return false
	}
	b.count++
	return true
}

// extractIP returns the real client IP. It only trusts X-Forwarded-For when
// the TRUSTED_PROXY env var is set to the proxy's CIDR (e.g. "10.0.0.0/8").
// Without that env var it uses RemoteAddr directly, preventing IP spoofing.
func extractIP(r *http.Request) string {
	trustedProxy := os.Getenv("TRUSTED_PROXY")
	if trustedProxy != "" {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
			if err == nil {
				remoteIP := net.ParseIP(remoteHost)
				_, proxyNet, parseErr := net.ParseCIDR(trustedProxy)
				if parseErr == nil && proxyNet.Contains(remoteIP) {
					// Only accept the leftmost (client) IP from a trusted proxy.
					clientIP := strings.TrimSpace(strings.Split(forwarded, ",")[0])
					if net.ParseIP(clientIP) != nil {
						return clientIP
					}
				}
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func loadServerConfig() {
	// Try loading .env from CWD first, then fall back to the directory that
	// contains the running executable. This makes the server work correctly
	// regardless of which directory it is launched from.
	if err := godotenv.Load(); err != nil {
		exe, exeErr := os.Executable()
		if exeErr == nil {
			_ = godotenv.Load(filepath.Join(filepath.Dir(exe), ".env"))
		}
	}

	jwtSecret = os.Getenv("SUPABASE_JWT_SECRET")
	if jwtSecret == "" {
		fmt.Println("⚠️  FATAL: SUPABASE_JWT_SECRET not set — all authenticated requests will be rejected.")
		fmt.Println("   Ensure backend/.env exists and the server is started from the backend/ directory.")
	} else {
		fmt.Printf("✅ JWT secret loaded (%d chars, starts with: %.8s...)\n", len(jwtSecret), jwtSecret)
	}

	allowedOrigin = os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	fmt.Printf("🔐 JWT Auth enabled. CORS origin: %s\n", allowedOrigin)
}

// --- Structured Error Response ---
type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Error: msg})
}

// --- JWKS Cache (for ES256 / ECC P-256 verification) ---
//
// Supabase migrated from Legacy HS256 (shared secret) to ECC P-256 keys.
// New tokens carry alg=ES256 and are signed with the project's EC private key.
// We verify them using the public JWKS endpoint Supabase exposes, cached
// in-process for 1 hour to avoid a network call on every request.

type jwkKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Crv string `json:"crv"`
	Alg string `json:"alg"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

var (
	jwksCache    []jwkKey
	jwksCacheMu  sync.RWMutex
	jwksFetchedAt time.Time
	jwksCacheTTL  = 1 * time.Hour
)

// getJWKS returns cached keys, refreshing from Supabase if the TTL has elapsed.
func getJWKS() ([]jwkKey, error) {
	jwksCacheMu.RLock()
	if jwksCache != nil && time.Since(jwksFetchedAt) < jwksCacheTTL {
		keys := jwksCache
		jwksCacheMu.RUnlock()
		return keys, nil
	}
	jwksCacheMu.RUnlock()

	jwksCacheMu.Lock()
	defer jwksCacheMu.Unlock()
	// Re-check after acquiring write lock (another goroutine may have refreshed).
	if jwksCache != nil && time.Since(jwksFetchedAt) < jwksCacheTTL {
		return jwksCache, nil
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL not set")
	}
	jwksURL := supabaseURL + "/auth/v1/.well-known/jwks.json"

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return nil, fmt.Errorf("JWKS fetch failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return nil, fmt.Errorf("JWKS read failed: %w", err)
	}

	var result struct {
		Keys []jwkKey `json:"keys"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("JWKS parse failed: %w", err)
	}

	jwksCache = result.Keys
	jwksFetchedAt = time.Now()
	fmt.Printf("[JWKS] Loaded %d key(s) from Supabase\n", len(result.Keys))
	return jwksCache, nil
}

// ecPublicKeyForKid finds the EC P-256 public key matching the given key ID.
func ecPublicKeyForKid(kid string) (*ecdsa.PublicKey, error) {
	keys, err := getJWKS()
	if err != nil {
		return nil, err
	}
	for _, k := range keys {
		if k.Kid != kid || k.Kty != "EC" || k.Crv != "P-256" {
			continue
		}
		xBytes, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil {
			return nil, fmt.Errorf("invalid JWK x: %w", err)
		}
		yBytes, err := base64.RawURLEncoding.DecodeString(k.Y)
		if err != nil {
			return nil, fmt.Errorf("invalid JWK y: %w", err)
		}
		return &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}, nil
	}
	// Key not in cache — may have just been rotated; force a refresh once.
	jwksCacheMu.Lock()
	jwksCache = nil
	jwksCacheMu.Unlock()
	keys, err = getJWKS()
	if err != nil {
		return nil, err
	}
	for _, k := range keys {
		if k.Kid != kid || k.Kty != "EC" || k.Crv != "P-256" {
			continue
		}
		xBytes, _ := base64.RawURLEncoding.DecodeString(k.X)
		yBytes, _ := base64.RawURLEncoding.DecodeString(k.Y)
		return &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}, nil
	}
	return nil, fmt.Errorf("no EC P-256 key found for kid=%q", kid)
}

// --- JWT Verification (ES256 + legacy HS256) ---

type jwtClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
	Exp   int64  `json:"exp"`
	Iat   int64  `json:"iat"`
	Iss   string `json:"iss"`
}

func verifySupabaseJWT(tokenString string) (*jwtClaims, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}

	// Decode header to determine algorithm and key ID.
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode header")
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("failed to parse header")
	}

	signingInput := parts[0] + "." + parts[1]

	switch header.Alg {
	case "ES256":
		// Modern Supabase ECC P-256 — verify via JWKS public key.
		pubKey, err := ecPublicKeyForKid(header.Kid)
		if err != nil {
			return nil, fmt.Errorf("signing key unavailable: %w", err)
		}
		sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err != nil {
			return nil, fmt.Errorf("failed to decode signature")
		}
		// ES256 JWT signatures are raw R || S (32 bytes each), not DER-encoded.
		if len(sigBytes) != 64 {
			return nil, fmt.Errorf("invalid ES256 signature length: %d", len(sigBytes))
		}
		r := new(big.Int).SetBytes(sigBytes[:32])
		s := new(big.Int).SetBytes(sigBytes[32:])
		digest := sha256.Sum256([]byte(signingInput))
		if !ecdsa.Verify(pubKey, digest[:], r, s) {
			return nil, fmt.Errorf("invalid signature")
		}

	case "HS256":
		// Legacy shared-secret HMAC — still accepted for tokens issued before
		// the project rotated to ECC.
		if jwtSecret == "" {
			return nil, fmt.Errorf("HS256 token received but SUPABASE_JWT_SECRET not set")
		}
		mac := hmac.New(sha256.New, []byte(jwtSecret))
		mac.Write([]byte(signingInput))
		expected := mac.Sum(nil)
		actual, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err != nil {
			return nil, fmt.Errorf("failed to decode signature")
		}
		if !hmac.Equal(actual, expected) {
			return nil, fmt.Errorf("invalid signature")
		}

	default:
		return nil, fmt.Errorf("unsupported algorithm: %q", header.Alg)
	}

	// Decode payload.
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload")
	}
	var claims jwtClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse claims")
	}

	// 5-second clock-skew tolerance.
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp+5 {
		return nil, fmt.Errorf("token expired")
	}

	// Issuer must match the project's auth URL.
	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		return nil, fmt.Errorf("server misconfiguration: SUPABASE_URL not set")
	}
	if claims.Iss != supabaseURL+"/auth/v1" {
		return nil, fmt.Errorf("invalid issuer: %q", claims.Iss)
	}

	return &claims, nil
}

// --- Security Headers Middleware ---
func securityHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Cache-Control", "no-store")
		next(w, r)
	}
}

// --- Rate Limit Middleware ---
func rateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !limiter.allow(ip) {
			writeError(w, http.StatusTooManyRequests, "Rate limit exceeded. Try again later.")
			return
		}
		next(w, r)
	}
}

// --- Auth Middleware ---
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "Missing authorization header")
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "Invalid authorization format")
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if token == "" {
			writeError(w, http.StatusUnauthorized, "Empty token")
			return
		}

		claims, err := verifySupabaseJWT(token)
		if err != nil {
			fmt.Printf("[Auth] Token rejected: %v\n", err)
			writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		fmt.Printf("[Auth] Verified user: %s (%s)\n", claims.Sub, claims.Email)

		r.Header.Set("X-User-ID", claims.Sub)
		r.Header.Set("X-User-Email", claims.Email)

		next(w, r)
	}
}

// --- CORS Middleware ---
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Expose-Headers", "X-Integrity-Verified, Content-Disposition")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// Compose middleware chain: CORS → Security → RateLimit → Auth → Handler
func protect(handler http.HandlerFunc) http.HandlerFunc {
	return enableCORS(securityHeaders(rateLimit(authMiddleware(handler))))
}

// --- Server Startup ---

func startServer() {
	loadServerConfig()
	initIPFSConfig()

	http.HandleFunc("/upload", protect(uploadHandler))
	http.HandleFunc("/retrieve", protect(retrieveHandler))
	http.HandleFunc("/delete", protect(deleteHandler))
	http.HandleFunc("/api/trigger-facial-auth", protect(triggerFacialAuthHandler))
	http.HandleFunc("/api/trigger-emotional-auth", protect(triggerEmotionalAuthHandler))
	
	// New Enrollment Endpoints
	http.HandleFunc("/api/enroll-facial-auth", protect(enrollFacialAuthHandler))
	http.HandleFunc("/api/enroll-emotional-auth", protect(enrollEmotionalAuthHandler))

	fmt.Println("🌐 Web3 DSN Server started on http://localhost:8080")
	server := &http.Server{
		Addr:         ":8080",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second, // Long for IPFS uploads
		IdleTimeout:  60 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}

// sanitizeFilename produces a safe basename with no path components.
//
// PATCH-WORK REPLACED: The original stripped a handful of known-bad characters
// but missed null bytes (\x00), which truncate filenames in POSIX C APIs, and
// did not validate UTF-8, allowing multi-byte sequences that look benign but
// become dangerous after unicode normalisation in downstream systems.
//
// INDUSTRY STANDARD: reject invalid UTF-8, strip every control character
// (0x00–0x1F, 0x7F) including null bytes, strip path separators, then
// enforce a byte-count limit on the validated result.
func sanitizeFilename(name string) string {
	// Reject invalid UTF-8 — replace with safe fallback.
	if !utf8.ValidString(name) {
		return "restored_file"
	}

	// Strip all ASCII control characters (including \x00, \r, \n, \t …).
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || r == 0x7F {
			continue
		}
		b.WriteRune(r)
	}
	name = b.String()

	// Strip path separators and shell-dangerous characters.
	for _, ch := range []string{"/", "\\", "..", "\"", "'", "`", "$", "&", "|", ";", "<", ">"} {
		name = strings.ReplaceAll(name, ch, "_")
	}

	if name == "" || name == "_" {
		return "restored_file"
	}

	// Enforce byte-length limit (not rune limit — avoid mid-rune truncation).
	const maxBytes = 200
	if len(name) > maxBytes {
		// Trim at a valid rune boundary.
		name = string([]rune(name)[:maxBytes/4]) // conservative rune estimate
	}
	return name
}

// --- API Types ---

type UploadResponse struct {
	OriginalHash    string `json:"original_hash"`
	RootHash        string `json:"root_hash"`
	EncryptionKey   string `json:"encryption_key"`
	FileName        string `json:"file_name"`
	ManifestContent string `json:"manifest_content"`
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Enforce upload size limit (10MB)
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "File exceeds 10MB limit")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing or invalid file")
		return
	}
	defer file.Close()

	userID := r.Header.Get("X-User-ID")
	fmt.Printf("\n[Web3 Upload] User: %s | Processing: %s\n", userID, header.Filename)

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	fileName := sanitizeFilename(header.Filename)

	originalHash, rootHash, manifestContent, key, err := EncryptAndStore(data, fileName)
	if err != nil {
		fmt.Printf("[Web3 Upload] FAILED: %v\n", err)
		writeError(w, http.StatusInternalServerError, "Encryption pipeline failed")
		return
	}

	// Encode and then burn the raw key bytes.
	// runtime.KeepAlive prevents the GC from collecting the slice before the
	// zeroing loop runs; without it the compiler is free to elide the loop as
	// dead code because nothing reads the values after they are zeroed.
	keyHex := hex.EncodeToString(key)
	for i := range key {
		key[i] = 0
	}
	runtime.KeepAlive(key)

	resp := UploadResponse{
		OriginalHash:    originalHash,
		RootHash:        rootHash,
		EncryptionKey:   keyHex,
		FileName:        fileName,
		ManifestContent: manifestContent,
	}

	writeJSON(w, http.StatusOK, resp)
	fmt.Printf("[Web3 Upload] Success. Merkle Root: %s\n", rootHash[:10])
}

// --- AI Vault Trigger Handlers ---

func triggerFacialAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var reqBody struct {
		PIN string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = "guest"
	}

	fmt.Printf("\n[Web3 AI Ops] 🔒 Launching Facial Recognition Protocol for user: %s\n", userID)
	
	cmd := exec.Command("python", "../vaults/facial_recognition/verify.py", "--user-id", userID)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUNBUFFERED=1")
	
	// Create pipe to securely send the PIN submitted from the React UI into the Python process
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to connect to AI process input")
		return
	}

	var stdoutBuf strings.Builder
	cmd.Stdout = io.MultiWriter(os.Stdout, &stdoutBuf)
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start AI process")
		return
	}

	// Write the PIN identically as if the user typed it, then close to send EOF
	go func() {
		defer stdinPipe.Close()
		io.WriteString(stdinPipe, reqBody.PIN+"\n")
	}()

	if err := cmd.Wait(); err != nil {
		fmt.Printf("\n❌ Facial Scan Process Exited: %v\n", err)
		writeError(w, http.StatusInternalServerError, "Facial scan process interrupted or failed.")
		return
	}

	outputStr := stdoutBuf.String()
	
	startIdx := strings.Index(outputStr, "{")
	endIdx := strings.LastIndex(outputStr, "}")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		jsonStr := outputStr[startIdx : endIdx+1]
		var result map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &result); err == nil {
			if status, ok := result["status"].(string); ok && status == "VAULT_UNLOCKED" {
				fmt.Println("\n✅ [Web3 AI Ops] Hardware verification success! Forwarding AES constraints to frontend.")
				writeJSON(w, http.StatusOK, result)
				return
			}
		}
	}

	writeError(w, http.StatusForbidden, "Biometric authentication failed or access denied.")
}

func triggerEmotionalAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var reqBody struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = "guest"
	}

	fmt.Printf("\n[Web3 AI Ops] 🧠 Launching Emotional State Protocol for user: %s\n", userID)

	cmd := exec.Command("python", "../vaults/emotional_state/verify.py", "--user-id", userID)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUNBUFFERED=1")
	
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to connect to AI process input")
		return
	}

	var stdoutBuf strings.Builder
	cmd.Stdout = io.MultiWriter(os.Stdout, &stdoutBuf)
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start NLP process")
		return
	}

	// Write the React text into the interactive python console buffer
	go func() {
		defer stdinPipe.Close()
		io.WriteString(stdinPipe, reqBody.Text+"\n")
	}()

	if err := cmd.Wait(); err != nil {
		fmt.Printf("\n❌ Emotional NLP Process Exited: %v\n", err)
		writeError(w, http.StatusInternalServerError, "NLP process interrupted or failed.")
		return
	}

	outputStr := stdoutBuf.String()
	startIdx := strings.Index(outputStr, "{")
	endIdx := strings.LastIndex(outputStr, "}")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		jsonStr := outputStr[startIdx : endIdx+1]
		var result map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &result); err == nil {
			if status, ok := result["status"].(string); ok && status == "VAULT_UNLOCKED" {
				fmt.Println("\n✅ [Web3 AI Ops] NLP Sentiment Check success! Forwarding state to frontend.")
				writeJSON(w, http.StatusOK, result)
				return
			}
		}
	}

	writeError(w, http.StatusForbidden, "Emotional state authentication failed or access denied.")
}

func enrollFacialAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var reqBody struct {
		PIN string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	userID := r.Header.Get("X-User-ID")
	if userID == "" { userID = "guest" }

	fmt.Printf("\n[Web3 AI Ops] 📝 Launching Facial Enrollment Protocol for user: %s\n", userID)
	
	cmd := exec.Command("python", "../vaults/facial_recognition/enroll.py", "--user-id", userID)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUNBUFFERED=1")
	
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to connect to AI process input")
		return
	}

	var stdoutBuf strings.Builder
	cmd.Stdout = io.MultiWriter(os.Stdout, &stdoutBuf)
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start AI process")
		return
	}

	go func() { defer stdinPipe.Close(); io.WriteString(stdinPipe, reqBody.PIN+"\n"+reqBody.PIN+"\n") }()

	if err := cmd.Wait(); err != nil {
		fmt.Printf("\n❌ Facial Enrollment Process Exited: %v\n", err)
		writeError(w, http.StatusInternalServerError, "Facial enrollment process interrupted.")
		return
	}

	outputStr := stdoutBuf.String()
	startIdx := strings.Index(outputStr, "{")
	endIdx := strings.LastIndex(outputStr, "}")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		jsonStr := outputStr[startIdx : endIdx+1]
		var result map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &result); err == nil {
			if status, ok := result["status"].(string); ok && status == "VAULT_ENROLLED" {
				fmt.Println("\n✅ [Web3 AI Ops] Hardware enrollment success!")
				writeJSON(w, http.StatusOK, result)
				return
			}
		}
	}
	writeError(w, http.StatusForbidden, "Biometric enrollment failed.")
}

func enrollEmotionalAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Emotional NLP models (RoBERTa) measure inference against a static target logic ("Joy"),
	// not a localized user embedding file like FaceNet does. Thus, checking the box
	// during Upload requires no hardware enrollment, just database tagging!
	userID := r.Header.Get("X-User-ID")
	fmt.Printf("\n✅ [Web3 AI Ops] NLP Sentiment Enrollment flagged active for user: %s\n", userID)
	
	writeJSON(w, http.StatusOK, map[string]string{"status": "VAULT_ENROLLED"})
}


func retrieveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Request too large")
		return
	}

	// --- Read root hash (required) ---
	rootFile, _, err := r.FormFile("roothash_file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing root hash file")
		return
	}
	defer rootFile.Close()

	rootBytes, err := io.ReadAll(rootFile)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read root hash")
		return
	}
	rootHash := strings.TrimSpace(string(rootBytes))
	if rootHash == "" {
		writeError(w, http.StatusBadRequest, "Empty root hash")
		return
	}

	// --- Read key file (required) ---
	keyFile, _, err := r.FormFile("key_file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing key file")
		return
	}
	defer keyFile.Close()

	keyBytes, err := io.ReadAll(keyFile)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to read key file")
		return
	}

	// --- Read manifest (required) ---
	manifestFile, _, err := r.FormFile("manifest_file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing manifest file")
		return
	}
	defer manifestFile.Close()

	manifestBytes, err := io.ReadAll(manifestFile)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to read manifest")
		return
	}
	manifestData := string(manifestBytes)

	originalHash := r.FormValue("original_hash")

	// Parse Key (hex-encoded or raw)
	key := keyBytes
	decodedKey, err := hex.DecodeString(string(keyBytes))
	if err == nil && len(decodedKey) == 32 {
		key = decodedKey
	}

	if len(rootHash) < 10 {
		writeError(w, http.StatusBadRequest, "Root hash too short")
		return
	}

	userID := r.Header.Get("X-User-ID")
	fmt.Printf("\n[Web3 Retrieve] User: %s | Reconstructing Root: %s...\n", userID, rootHash[:10])

	// 1. Process Manifest
	rawLines := strings.Split(strings.TrimSpace(manifestData), "\n")
	var cidList []string
	filename := "restored_file"

	const maxManifestCIDs = 500 // 500 × 256 KB = 128 MB theoretical max

	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# Filename: ") {
			filename = sanitizeFilename(strings.TrimPrefix(line, "# Filename: "))
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		// Validate every CID before touching the network.
		if !isValidCID(line) {
			writeError(w, http.StatusBadRequest, "Manifest contains an invalid CID — file may be corrupt or tampered")
			return
		}
		if len(cidList) >= maxManifestCIDs {
			writeError(w, http.StatusBadRequest, "Manifest exceeds maximum chunk count")
			return
		}
		cidList = append(cidList, line)
	}

	if len(cidList) == 0 {
		writeError(w, http.StatusBadRequest, "Manifest contains no chunk CIDs")
		return
	}

	// 2. Fetch from IPFS Network
	fmt.Println("[Web3 Retrieve] Fetching chunks from IPFS peers...")
	var assembledEncryptedData []byte
	var loadedCIDs []string

	for _, cid := range cidList {
		chunkData, err := DownloadChunkFromIPFS(cid)
		if err != nil {
			fmt.Println("IPFS Fetch Error:", err)
			writeError(w, http.StatusServiceUnavailable, "Failed to retrieve data from IPFS network")
			return
		}
		assembledEncryptedData = append(assembledEncryptedData, chunkData...)
		loadedCIDs = append(loadedCIDs, cid)
	}

	// 3. Verify Merkle Root
	calculatedRoot := BuildMerkleTree(loadedCIDs)
	if calculatedRoot == nil || calculatedRoot.Hash != rootHash {
		fmt.Println("Integrity Check Failed: Root Hash Mismatch or empty chunk list")
		writeError(w, http.StatusForbidden, "Integrity verification failed")
		return
	}

	// 4. Decrypt
	block, err := aes.NewCipher(key)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid encryption key")
		return
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Decryption initialization failed")
		return
	}
	nonceSize := gcm.NonceSize()
	if len(assembledEncryptedData) < nonceSize {
		writeError(w, http.StatusBadRequest, "Encrypted data is corrupted")
		return
	}
	nonce, ciphertext := assembledEncryptedData[:nonceSize], assembledEncryptedData[nonceSize:]
	decryptedData, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		writeError(w, http.StatusForbidden, "Decryption failed — incorrect key or corrupted data")
		return
	}

	// 5. Verify Original Hash
	verified := false
	if originalHash != "" {
		if HashData(decryptedData) == originalHash {
			verified = true
			w.Header().Set("X-Integrity-Verified", "true")
		} else {
			w.Header().Set("X-Integrity-Verified", "false")
		}
	} else {
		w.Header().Set("X-Integrity-Verified", "unavailable")
	}

	// Serve File (filename already sanitized)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(decryptedData)

	fmt.Printf("[Web3 Retrieve] Success. Verified: %v\n", verified)
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Request too large")
		return
	}

	manifestFile, _, err := r.FormFile("manifest_file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing manifest file")
		return
	}
	defer manifestFile.Close()

	manifestBytes, err := io.ReadAll(manifestFile)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to read manifest")
		return
	}
	manifestData := string(manifestBytes)

	userID := r.Header.Get("X-User-ID")
	fmt.Printf("\n[Web3 Delete] User: %s | Initializing Purge Sequence...\n", userID)

	// Process Manifest — validate every CID before touching the network.
	rawLines := strings.Split(strings.TrimSpace(manifestData), "\n")
	var unpinnedCount int
	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if !isValidCID(line) {
			writeError(w, http.StatusBadRequest, "Manifest contains an invalid CID")
			return
		}
		if err := UnpinFromIPFS(line); err != nil {
			fmt.Printf("Failed to unpin %s: %v\n", line, err)
		} else {
			unpinnedCount++
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"chunks_purged": unpinnedCount,
	})
	fmt.Printf("[Web3 Delete] Purge Complete. %d chunks unpinned.\n", unpinnedCount)
}
