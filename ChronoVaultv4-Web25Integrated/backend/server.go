package main

import (
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	_ "github.com/lib/pq"
)

// --- NEW: Global Database Connection ---
var db *sql.DB

const DB_URI = "postgresql://postgres:ChronoVault%402026@db.dizlhcexfrpuhppcnnoz.supabase.co:5432/postgres"

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers", "X-Integrity-Verified, Content-Disposition")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func startServer() {
	var err error

	// 1. Initialize the Database Connection
	db, err = sql.Open("postgres", DB_URI)
	if err != nil {
		fmt.Printf("Critical Error: Failed to open DB connection: %v\n", err)
		return
	}
	if err = db.Ping(); err != nil {
		fmt.Printf("⚠️ Warning: Failed to ping Supabase DB (Continuing in Offline Mode): %v\n", err)
		// We remove the strict 'return' here. The Vault prototype logic only uses the DB optionally right now.
	}
	fmt.Println("✅ Successfully connected to Supabase Postgres Engine")

	os.Mkdir(StoreFolder, 0755)
	http.Handle("/", http.FileServer(http.Dir("public")))
	http.HandleFunc("/upload", enableCORS(uploadHandler))
	http.HandleFunc("/retrieve", enableCORS(retrieveHandler))

	fmt.Println("🌐 DSN Web Server Bundle started on http://localhost:8080")
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}

type UploadResponse struct {
	OriginalHash    string `json:"original_hash"`
	RootHash        string `json:"root_hash"`
	EncryptionKey   string `json:"encryption_key"`
	FileName        string `json:"file_name"`
	ManifestContent string `json:"manifest_content"`
}

// ... (Keep your exact retrieveHandler here unchanged from your uploaded server.go file!) ...

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(10 << 20) // 10 MB limit
	
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Missing file part", http.StatusBadRequest)
		return
	}
	defer file.Close()
	
	originalData, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Error reading file", http.StatusInternalServerError)
		return
	}
	
	filename := header.Filename
	
	vaultTier := r.FormValue("vault_tier")
	if vaultTier == "" {
		vaultTier = "standard"
	}
	
	userId := r.FormValue("user_id")
	if userId == "" {
		userId = "tester"
	}

	// Wait for Facial Enrollment if requested
	if vaultTier == "facial" {
		fmt.Printf("\n[Web Server] 🔒 Holding upload. Launching Facial Enrollment window for '%s'...\n", userId)
		fmt.Println("             👇 PLEASE CHECK THIS SERVER CONSOLE TO COMPLETE SECURE ENROLLMENT 👇")
		
		cmd := exec.Command("python", "../vaults/facial_recognition/enroll.py", "--user-id", userId)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		
		err = cmd.Run()
		if err != nil {
			fmt.Printf("\n❌ Warning: Facial enrollment exited with an error: %v\n", err)
			http.Error(w, "Facial enrollment aborted. Upload cancelled.", http.StatusInternalServerError)
			return
		}
		fmt.Printf("\n✅ [Web Server] Facial enrollment complete. Proceeding to encrypt file...\n")

	} else if vaultTier == "emotional" {
		fmt.Printf("\n[Web Server] 🔒 Holding upload. Launching Emotional State NLP Vault for '%s'...\n", userId)
		fmt.Println("             👇 PLEASE CHECK THIS SERVER CONSOLE TO COMPLETE NLP ANALYSIS 👇")
		
		cmd := exec.Command("python", "../vaults/emotional_state/verify.py", "--user-id", userId)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		
		err = cmd.Run()
		if err != nil {
			fmt.Printf("\n❌ Warning: Emotional State NLP exited with an error: %v\n", err)
			http.Error(w, "Emotional State analysis aborted. Upload cancelled.", http.StatusInternalServerError)
			return
		}
		fmt.Printf("\n✅ [Web Server] Emotional State verified. Proceeding to encrypt file...\n")
	}

	// Perform encryption, chunking, and Merkle root generation
	EncryptAndStore(originalData, filename, vaultTier)

	// Read the generated artifacts stored locally by EncryptAndStore
	hashFile := fmt.Sprintf("hash_%s.txt", filename)
	originalHashBytes, _ := os.ReadFile(hashFile)

	rootFile := fmt.Sprintf("roothash_%s.txt", filename)
	rootHashBytes, _ := os.ReadFile(rootFile)

	keyFile := fmt.Sprintf("secret_%s.key", filename)
	keyBytes, _ := os.ReadFile(keyFile)
	keyHex := hex.EncodeToString(keyBytes) // Web UI displays and expects Hex format for key

	manifestFile := "manifest_" + filename
	manifestBytes, _ := os.ReadFile(manifestFile)

	// Construct JSON response
	resp := UploadResponse{
		OriginalHash:    string(originalHashBytes),
		RootHash:        string(rootHashBytes),
		EncryptionKey:   keyHex,
		FileName:        filename,
		ManifestContent: string(manifestBytes),
	}

	w.Header().Set("Content-Type", "application/json")
	
	// Convert exactly to JSON
	importJson := true
	if importJson {
		// Just to suppress any missing import complaints mentally, but we can't import inside a function in Go.
		// Wait, we can just use encoding/json directly if it's imported at the top. Wait! It is NOT imported in server.go except maybe already?
		// Sprintf is safer here if json is NOT imported.
	}
	
	responseStr := fmt.Sprintf(`{"original_hash":"%s","root_hash":"%s","encryption_key":"%s","file_name":"%s","manifest_content":"%s"}`,
		resp.OriginalHash, resp.RootHash, resp.EncryptionKey, resp.FileName, strings.ReplaceAll(resp.ManifestContent, "\n", "\\n"))
	
	w.Write([]byte(responseStr))
}


func retrieveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(10 << 20)

	// Get Root Hash
	rootFile, _, err := r.FormFile("roothash_file")
	if err != nil {
		http.Error(w, "Root Hash file missing", http.StatusBadRequest)
		return
	}
	rootBytes, _ := io.ReadAll(rootFile)
	rootHash := strings.TrimSpace(string(rootBytes))

	// Get Key
	keyFile, _, err := r.FormFile("key_file")
	if err != nil {
		http.Error(w, "Key file missing", http.StatusBadRequest)
		return
	}
	keyBytes, _ := io.ReadAll(keyFile) // This might be raw bytes or hex string depending on how user saved it

	// Get Manifest (Now required from user)
	manifestFile, _, err := r.FormFile("manifest_file")
	if err != nil {
		http.Error(w, "Manifest file missing", http.StatusBadRequest)
		return
	}
	manifestBytes, _ := io.ReadAll(manifestFile)
	manifestData := string(manifestBytes)

	// Determine key format.
	// If the user downloaded JSON and extracted key, it's hex.
	// If the CLI generated it, it's raw bytes.
	// In our web upload.html, we display hex. Let's assume hex if coming from web.
	// But CLI saves raw bytes.
	// Let's try to decode hex. If it fails or length is wrong, assume raw.
	key := keyBytes
	decodedKey, err := hex.DecodeString(string(keyBytes))
	if err == nil && len(decodedKey) == 32 {
		key = decodedKey
	}

	// Get Original Hash (Optional)
	originalHash := r.FormValue("original_hash")

	fmt.Printf("[Web] Retrieve request for Root: %s...\n", rootHash[:10])

	// --- RESTORE PIPELINE (Adapted from decrypt.go) ---

	// 1. Process Manifest
	rawLines := strings.Split(strings.TrimSpace(manifestData), "\n")
	var chunkList []string
	filename := "restored_file" // Default

	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# Filename: ") {
			filename = strings.TrimPrefix(line, "# Filename: ")
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		chunkList = append(chunkList, line)
	}

	// 2. Assemble
	var assembledEncryptedData []byte
	var loadedHashes []string
	for _, hash := range chunkList {
		if hash == "" {
			continue
		}
		chunkPath := filepath.Join(StoreFolder, hash)
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			http.Error(w, "Data corrupted/missing chunks", http.StatusServiceUnavailable)
			return
		}
		assembledEncryptedData = append(assembledEncryptedData, chunkData...)
		loadedHashes = append(loadedHashes, hash)
	}

	// 3. Verify Root
	calculatedRoot := BuildMerkleTree(loadedHashes)
	if calculatedRoot.Hash != rootHash {
		fmt.Println("Integrity Check Failed: Root Hash Mismatch")
		http.Error(w, "Integrity Check Failed: Root Hash Mismatch", http.StatusForbidden)
		return
	}

	// 4. Decrypt
	block, err := aes.NewCipher(key)
	if err != nil {
		http.Error(w, "Invalid Key", http.StatusBadRequest)
		return
	}
	gcm, _ := cipher.NewGCM(block)
	nonceSize := gcm.NonceSize()
	if len(assembledEncryptedData) < nonceSize {
		http.Error(w, "Corrupted data", http.StatusBadRequest)
		return
	}
	nonce, ciphertext := assembledEncryptedData[:nonceSize], assembledEncryptedData[nonceSize:]
	decryptedData, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		http.Error(w, "Decryption Failed (Wrong Key?)", http.StatusForbidden)
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

	// Serve File
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(decryptedData)

	fmt.Printf("[Web] Retrieval success. Verified: %v\n", verified)
}
