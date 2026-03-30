package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

// EncryptAndStore handles the encryption and shredding logic.
// Returns (originalHash, rootHash, manifestContent, key, error).
// On partial failure, uploaded chunks are rolled back (unpinned).
func EncryptAndStore(originalData []byte, filename string) (string, string, string, []byte, error) {
	fmt.Println("--- PHASE 1: ENCRYPT & SHRED ---")

	// 1. Hash Original Data (Identity)
	originalHash := HashData(originalData)
	fmt.Printf("[Enc] Original Hash: %s\n", originalHash[:10])

	// 2. Generate Encryption Key (AES-256)
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return "", "", "", nil, fmt.Errorf("CSPRNG failure generating key: %w", err)
	}

	// 3. Encrypt Data with AES-256-GCM
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", "", nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", "", nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", "", nil, fmt.Errorf("CSPRNG failure generating nonce: %w", err)
	}

	encryptedData := gcm.Seal(nonce, nonce, originalData, nil)

	// 4. Shred and Upload Chunks to IPFS (with rollback on failure)
	var chunkCIDs []string

	for i := 0; i < len(encryptedData); i += ChunkSize {
		end := i + ChunkSize
		if end > len(encryptedData) {
			end = len(encryptedData)
		}
		chunk := encryptedData[i:end]

		cid, err := UploadChunkToIPFS(chunk, filename)
		if err != nil {
			// ROLLBACK: Unpin any chunks that were already uploaded
			fmt.Printf("[Enc] ROLLBACK: Chunk upload failed at index %d, unpinning %d chunks\n", i/ChunkSize, len(chunkCIDs))
			for _, pinnedCID := range chunkCIDs {
				_ = UnpinFromIPFS(pinnedCID) // Best-effort cleanup
			}
			return "", "", "", nil, fmt.Errorf("IPFS upload failed for chunk %d: %w", i/ChunkSize, err)
		}
		chunkCIDs = append(chunkCIDs, cid)
	}
	fmt.Printf("[Enc] Shredded file into %d chunks\n", len(chunkCIDs))

	// 5. Build Merkle Tree
	rootNode := BuildMerkleTree(chunkCIDs)
	fmt.Printf("[Enc] Merkle Root Hash: %s...\n", rootNode.Hash[:10])

	// Build Manifest (Order of chunks)
	manifestContent := "# Filename: " + filename + "\n"
	for _, h := range chunkCIDs {
		manifestContent += h + "\n"
	}

	return originalHash, rootNode.Hash, manifestContent, key, nil
}
