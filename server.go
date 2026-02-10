package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func startServer() {
	// Ensure directories exist
	os.Mkdir(StoreFolder, 0755)

	http.Handle("/", http.FileServer(http.Dir("public")))
	http.HandleFunc("/upload", uploadHandler)
	http.HandleFunc("/retrieve", retrieveHandler)

	fmt.Println("🌐 DSN Web Server Bundle started on http://localhost:8080")
	fmt.Println("📂 Serving ./public")
	err := http.ListenAndServe(":8080", nil)
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

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10MB max upload
	r.ParseMultipartForm(10 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error retrieving file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fmt.Printf("[Web] Processing upload: %s\n", header.Filename)

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Error reading file", http.StatusInternalServerError)
		return
	}

	// --- ENCRYPTION PIPELINE (Adapted from encrypt.go) ---

	// 1. Identity
	originalHash := HashData(data)

	// 2. Key Gen
	key := make([]byte, 32)
	io.ReadFull(rand.Reader, key)

	// 3. Encrypt
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	encryptedData := gcm.Seal(nonce, nonce, data, nil)

	// 4. Shred & Store
	var chunkHashes []string
	for i := 0; i < len(encryptedData); i += ChunkSize {
		end := i + ChunkSize
		if end > len(encryptedData) {
			end = len(encryptedData)
		}
		chunk := encryptedData[i:end]
		hash := HashData(chunk)

		// Store chunk
		path := filepath.Join(StoreFolder, hash)
		os.WriteFile(path, chunk, 0644)
		chunkHashes = append(chunkHashes, hash)
	}

	// 5. Merkle Tree
	rootNode := BuildMerkleTree(chunkHashes)
	rootHash := rootNode.Hash

	// 6. Save Manifest (indexed by RootHash)
	// We include the filename as a comment in the manifest so it is self-contained
	manifestLines := []string{"# Filename: " + header.Filename}
	manifestLines = append(manifestLines, chunkHashes...)
	manifestContent := strings.Join(manifestLines, "\n")

	// --- RESPONSE ---
	resp := UploadResponse{
		OriginalHash:    originalHash,
		RootHash:        rootHash,
		EncryptionKey:   hex.EncodeToString(key),
		FileName:        header.Filename,
		ManifestContent: manifestContent,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
	fmt.Printf("[Web] Upload success. Root: %s\n", rootHash[:10])
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
