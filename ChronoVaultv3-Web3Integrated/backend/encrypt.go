package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

unc DownloadChunkFromIPFS(cid string) ([]byte, error) {
	fmt.Printf("   [IPFS] Locating and fetching CID: %s...\n", cid)

	// We use the public IPFS gateway to retrieve the file
	url := "https://gateway.pinata.cloud/ipfs/" + cid

	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to download CID %s: status %d", cid, resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}


// EncryptAndStore handles the encryption and shredding logic
func EncryptAndStore(originalData []byte, filename string) (string, string, string, []byte){
	fmt.Println("--- PHASE 1: ENCRYPT & SHRED ---")
	os.MkdirAll(StoreFolder, os.ModePerm)

	// 1. Hash Original Data (Identity)
	originalHash := HashData(originalData)
	hashFile := fmt.Sprintf("hash_%s.txt", filename)
	os.WriteFile(hashFile, []byte(originalHash), 0644)
	fmt.Printf("[Enc] Original Hash saved to %s\n", hashFile)

	// 2. Generate Encryption Key
	key := make([]byte, 32) // AES-256
	io.ReadFull(rand.Reader, key)
	keyFile := fmt.Sprintf("secret_%s.key", filename)
	os.WriteFile(keyFile, key, 0644)
	fmt.Printf("[Enc] Secret Key saved to %s\n", keyFile)

	// 3. Encrypt Data
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	encryptedData := gcm.Seal(nonce, nonce, originalData, nil)

	// 4. Shred and Store Chunks
	var chunkHashes []string
	for i := 0; i < len(encryptedData); i += ChunkSize {
		end := i + ChunkSize
		if end > len(encryptedData) {
			end = len(encryptedData)
		}
		chunk := encryptedData[i:end]
        cid, err := UploadChunkToIPFS(chunk, filename)
if err != nil {
	panic(err)
}

chunkHashes = append(chunkHashes, cid)
		

		
	}
	fmt.Printf("[Enc] Shredded file into %d chunks\n", len(chunkHashes))

	// 5. Build Merkle Tree & Save Root
	rootNode := BuildMerkleTree(chunkHashes)
	rootFile := fmt.Sprintf("roothash_%s.txt", filename)
	os.WriteFile(rootFile, []byte(rootNode.Hash), 0644)
	fmt.Printf("[Enc] Merkle Root Hash saved: %s...\n", rootNode.Hash[:10])

	// Save Manifest (Order of chunks)
	manifestContent := "# Filename: " + filename + "\n"
	for _, h := range chunkHashes {
		manifestContent += h + "\n"
	}
	os.WriteFile("manifest_"+filename, []byte(manifestContent), 0644)
	return originalHash, rootNode.Hash, manifestContent, key
}
