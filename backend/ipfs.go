package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// --- CID Validation ---
//
// PATCH-WORK REPLACED: The original code concatenated an untrusted CID string
// directly into a URL ("…/ipfs/" + cid) with only an empty-string check.
// A CID like "../../etc/passwd" or "x?foo=bar" becomes a path-traversal or
// query-injection attack against the Pinata gateway.
//
// INDUSTRY STANDARD: allow-list the two well-known CID formats so that any
// string that doesn't match is rejected before it touches a network call.
//   CIDv0 — Qm<44 base58 chars>  (SHA2-256 multihash, base58btc)
//   CIDv1 — b<58+ base32 chars>  (multibase prefix 'b' = base32lower)
var (
	cidV0Re = regexp.MustCompile(`^Qm[1-9A-HJ-NP-Za-km-z]{44}$`)
	cidV1Re = regexp.MustCompile(`^b[a-z2-7]{58,}$`)
)

func isValidCID(cid string) bool {
	return cidV0Re.MatchString(cid) || cidV1Re.MatchString(cid)
}

// --- Singleton IPFS Configuration ---
// Loaded once at startup via initIPFSConfig(), not per-request.
var pinataJWT string

func initIPFSConfig() {
	_ = godotenv.Load()

	jwt := os.Getenv("PINATA_JWT")
	if jwt == "" {
		fmt.Println("⚠️  WARNING: PINATA_JWT not found in environment. IPFS operations will fail.")
		return
	}

	// Clean whitespace artifacts from env parsing
	jwt = strings.ReplaceAll(jwt, "\n", "")
	jwt = strings.ReplaceAll(jwt, "\r", "")
	jwt = strings.ReplaceAll(jwt, "\t", "")
	jwt = strings.ReplaceAll(jwt, " ", "")

	pinataJWT = jwt
	fmt.Println("📌 Pinata IPFS configured.")
}

// Shared HTTP client with timeouts (prevents goroutine leaks from hanging connections)
var ipfsClient = &http.Client{
	Timeout: 60 * time.Second,
}

// --- IPFS Upload with Retry ---

const maxIPFSRetries = 3

// UploadChunkToIPFS pushes a byte slice to the global IPFS network.
// Uses exponential backoff with 3 retries for transient failures.
func UploadChunkToIPFS(chunk []byte, filename string) (string, error) {
	if pinataJWT == "" {
		return "", fmt.Errorf("IPFS not configured: missing PINATA_JWT")
	}

	var lastErr error
	for attempt := 0; attempt < maxIPFSRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second // 1s, 2s
			fmt.Printf("   [IPFS] Retry %d/%d after %v...\n", attempt+1, maxIPFSRetries, backoff)
			time.Sleep(backoff)
		}

		cid, err := doUploadChunk(chunk, filename)
		if err == nil {
			return cid, nil
		}
		lastErr = err
		fmt.Printf("   [IPFS] Upload attempt %d failed: %v\n", attempt+1, err)
	}

	return "", fmt.Errorf("IPFS upload failed after %d attempts: %w", maxIPFSRetries, lastErr)
}

func doUploadChunk(chunk []byte, filename string) (string, error) {
	// Prepare the multipart form data required by Pinata
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(chunk); err != nil {
		return "", fmt.Errorf("failed to write chunk data: %w", err)
	}
	writer.Close()

	// Send to Pinata
	req, err := http.NewRequest("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS", body)
	if err != nil {
		return "", err
	}
	req.Header.Add("Authorization", "Bearer "+pinataJWT)
	req.Header.Add("Content-Type", writer.FormDataContentType())

	resp, err := ipfsClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read Pinata response: %w", err)
	}

	// Check HTTP status
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Pinata returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse the response to extract the CID (IpfsHash)
	var result struct {
		IpfsHash string `json:"IpfsHash"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse Pinata response: %w", err)
	}

	if result.IpfsHash == "" {
		return "", fmt.Errorf("empty CID from Pinata: %s", string(respBody))
	}

	fmt.Printf("   [IPFS] Pinned Chunk CID: %s\n", result.IpfsHash)
	return result.IpfsHash, nil
}

// maxChunkDownload is the maximum bytes we will read from a single IPFS chunk.
// A malicious or misconfigured gateway could otherwise stream gigabytes into RAM.
// ChunkSize (256 KB) + 16-byte GCM tag + 12-byte nonce + 1 KB margin.
const maxChunkDownload = ChunkSize + 4*1024

// DownloadChunkFromIPFS fetches a chunk back from the decentralized network.
func DownloadChunkFromIPFS(cid string) ([]byte, error) {
	if !isValidCID(cid) {
		return nil, fmt.Errorf("invalid or unsafe CID: %q", cid)
	}

	fmt.Printf("   [IPFS] Locating and fetching CID: %s...\n", cid)

	// Use a pre-validated constant base URL — never interpolate user input into paths.
	url := "https://gateway.pinata.cloud/ipfs/" + cid

	resp, err := ipfsClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to download CID %s: status %d", cid, resp.StatusCode)
	}

	// Hard cap: io.ReadAll with an unbounded body is an OOM vector.
	// io.LimitReader returns EOF after maxChunkDownload bytes, causing
	// io.ReadAll to return cleanly with a truncated (and therefore corrupt)
	// payload, which the Merkle + GCM checks will then reject.
	limited := io.LimitReader(resp.Body, int64(maxChunkDownload+1))
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("failed to read chunk body: %w", err)
	}
	if len(data) > maxChunkDownload {
		return nil, fmt.Errorf("chunk from gateway exceeds maximum allowed size (%d bytes)", maxChunkDownload)
	}
	return data, nil
}

// UnpinFromIPFS removes a pinned file from the global IPFS network via Pinata.
func UnpinFromIPFS(cid string) error {
	if pinataJWT == "" {
		return fmt.Errorf("IPFS not configured: missing PINATA_JWT")
	}
	if !isValidCID(cid) {
		return fmt.Errorf("invalid or unsafe CID: %q", cid)
	}

	url := "https://api.pinata.cloud/pinning/unpin/" + cid
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Add("Authorization", "Bearer "+pinataJWT)

	resp, err := ipfsClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 404 { // 404 = already deleted
		return fmt.Errorf("failed to unpin CID %s: status %d", cid, resp.StatusCode)
	}

	fmt.Printf("   [IPFS] Successfully unpinned CID: %s\n", cid)
	return nil
}
