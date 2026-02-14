package main

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DecryptAndRestore handles the reconstruction and verification logic
func DecryptAndRestore(filename string) {
	fmt.Println("--- PHASE 2: RESTORE & VERIFY ---")

	// 1. Load All Metadata
	key, _ := os.ReadFile("secret_" + filename + ".key")
	expectedRoot, _ := os.ReadFile("roothash_" + filename + ".txt")
	expectedOriginalHash, _ := os.ReadFile("hash_" + filename + ".txt")
	manifestData, _ := os.ReadFile("manifest_" + filename)

	rawLines := strings.Split(strings.TrimSpace(string(manifestData)), "\n")
	var chunkList []string
	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		chunkList = append(chunkList, line)
	}
	fmt.Printf("[Dec] Manifest loaded. Need to fetch %d chunks.\n", len(chunkList))

	// 2. Fetch and Reassemble Chunks
	var assembledEncryptedData []byte
	var loadedHashes []string

	for _, hash := range chunkList {
		if hash == "" {
			continue
		}

		chunkPath := filepath.Join(StoreFolder, hash)
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			panic("Data Loss! Chunk not found: " + hash)
		}

		assembledEncryptedData = append(assembledEncryptedData, chunkData...)
		loadedHashes = append(loadedHashes, hash)
	}

	// 3. Verify Merkle Root
	calculatedRoot := BuildMerkleTree(loadedHashes)
	if calculatedRoot.Hash != string(expectedRoot) {
		panic("SECURITY ALERT: Merkle Root mismatch!")
	}
	fmt.Println("[Dec] VERIFIED: Merkle Root matches.")

	// 4. Decrypt
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonceSize := gcm.NonceSize()
	if len(assembledEncryptedData) < nonceSize {
		panic("Error: Encrypted data too short")
	}
	nonce, ciphertext := assembledEncryptedData[:nonceSize], assembledEncryptedData[nonceSize:]
	decryptedData, err := gcm.Open(nil, nonce, ciphertext, nil)
	Check(err)

	// 5. Verify Original Hash
	if HashData(decryptedData) != string(expectedOriginalHash) {
		panic("SECURITY ALERT: Hash mismatch!")
	}
	fmt.Println("[Dec] VERIFIED: Original Hash matches.")

	// 6. Save Output
	outputFile := "restored_" + filename
	os.WriteFile(outputFile, decryptedData, 0644)
	fmt.Printf("[Dec] Success! File saved to '%s'\n", outputFile)
}
