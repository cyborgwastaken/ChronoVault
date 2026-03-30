package main

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// --- CORS Middleware for React ---
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
	http.Handle("/", http.FileServer(http.Dir("public")))
	http.HandleFunc("/upload", enableCORS(uploadHandler))
	http.HandleFunc("/retrieve", enableCORS(retrieveHandler))
	http.HandleFunc("/delete", enableCORS(deleteHandler))

	fmt.Println("🌐 Web3 DSN Server started on http://localhost:8080")
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

	r.ParseMultipartForm(10 << 20) // 10MB limit

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error retrieving file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fmt.Printf("\n[Web3 Upload] Processing: %s\n", header.Filename)

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Error reading file", http.StatusInternalServerError)
		return
	}

	fileName := header.Filename
	if strings.TrimSpace(fileName) == "" {
		fileName = "uploaded_file"
	}

	originalHash, rootHash, manifestContent, key := EncryptAndStore(data, fileName)

	// --- RESPONSE ---
	resp := UploadResponse{
		OriginalHash:    originalHash,
		RootHash:        rootHash,
		EncryptionKey:   hex.EncodeToString(key),
		FileName:        fileName,
		ManifestContent: manifestContent,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
	fmt.Printf("[Web3 Upload] Success. Merkle Root: %s\n", rootHash[:10])
}

func retrieveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(10 << 20)

	// Extract form files (Root Hash, Key, Manifest, Original Hash)
	rootFile, _, err := r.FormFile("roothash_file")
if err != nil {
	http.Error(w, "Missing root hash", http.StatusBadRequest)
	return
}
defer rootFile.Close()

rootBytes, err := io.ReadAll(rootFile)
if err != nil {
	http.Error(w, "Failed to read root hash", http.StatusInternalServerError)
	return
}

rootHash := strings.TrimSpace(string(rootBytes))

	keyFile, _, _ := r.FormFile("key_file")
	keyBytes, _ := io.ReadAll(keyFile)

	manifestFile, _, _ := r.FormFile("manifest_file")
	manifestBytes, _ := io.ReadAll(manifestFile)
	manifestData := string(manifestBytes)

	originalHash := r.FormValue("original_hash")

	// Parse Key
	key := keyBytes
	decodedKey, err := hex.DecodeString(string(keyBytes))
	if err == nil && len(decodedKey) == 32 {
		key = decodedKey
	}

	fmt.Printf("\n[Web3 Retrieve] Reconstructing Root: %s...\n", rootHash[:10])

	// 1. Process Manifest
	rawLines := strings.Split(strings.TrimSpace(manifestData), "\n")
	var cidList []string
	filename := "restored_file"

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
		cidList = append(cidList, line)
	}

	// 2. Fetch from IPFS Network
	fmt.Println("[Web3 Retrieve] Fetching chunks from IPFS peers...")
	var assembledEncryptedData []byte
	var loadedCIDs []string

	for _, cid := range cidList {
		if cid == "" {
			continue
		}

		// NEW: Download from IPFS instead of local disk
		chunkData, err := DownloadChunkFromIPFS(cid)
		if err != nil {
			fmt.Println("IPFS Fetch Error:", err)
			http.Error(w, "Data missing from IPFS swarm", http.StatusServiceUnavailable)
			return
		}

		assembledEncryptedData = append(assembledEncryptedData, chunkData...)
		loadedCIDs = append(loadedCIDs, cid)
	}

	// 3. Verify Merkle Root
	calculatedRoot := BuildMerkleTree(loadedCIDs)
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

	fmt.Printf("[Web3 Retrieve] Success. Verified: %v\n", verified)
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(10 << 20)
	manifestFile, _, err := r.FormFile("manifest_file")
	if err != nil {
		http.Error(w, "Missing manifest", http.StatusBadRequest)
		return
	}
	defer manifestFile.Close()

	manifestBytes, _ := io.ReadAll(manifestFile)
	manifestData := string(manifestBytes)

	fmt.Println("\n[Web3 Delete] Initializing Purge Sequence...")

	// Process Manifest
	rawLines := strings.Split(strings.TrimSpace(manifestData), "\n")
	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Unpin each CID
		err := UnpinFromIPFS(line)
		if err != nil {
			fmt.Printf("Failed to unpin %s: %v\n", line, err)
		}
	}
	
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Shreds deleted from IPFS swarm"))
	fmt.Println("[Web3 Delete] Purge Complete.")
}
