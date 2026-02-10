package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
)

// --- Shared Configuration & Structs ---

const (
	ChunkSize   = 1024 // 1KB chunks
	StoreFolder = "shredded_store"
)

// MerkleNode is used by both encrypt and decrypt
type MerkleNode struct {
	Left, Right *MerkleNode
	Hash        string
}

// --- Main Entry Point ---

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "server" || os.Args[1] == "web") {
		startServer()
		return
	}

	runSimulation()
}

func runSimulation() {
	// Define the file to work on
	inputFile := "original.txt"

	// 1. Prepare Environment
	os.RemoveAll(StoreFolder)
	os.Mkdir(StoreFolder, 0755)

	// Create a dummy file if it doesn't exist
	if _, err := os.Stat(inputFile); os.IsNotExist(err) {
		fmt.Println("Creating dummy original.txt...")
		os.WriteFile(inputFile, []byte("This is some super secret decentralized data that we want to shred and store securely. Repeater Repeater Repeater."), 0644)
	}

	fmt.Println("=== STARTING DECENTRALIZED STORAGE PIPELINE ===")

	// 2. Read Input File
	fmt.Printf("[Main] Reading input file: %s\n", inputFile)
	originalData, err := os.ReadFile(inputFile)
	Check(err)

	// 3. Trigger Encryption Pipeline (defined in encrypt.go)
	EncryptAndStore(originalData, inputFile)

	fmt.Println("\n------------------------------------------------")
	fmt.Println("   (Network Simulation: Transferring files...)")

	// 4. Trigger Decryption Pipeline (defined in decrypt.go)
	DecryptAndRestore(inputFile)
}

// --- Shared Helper Functions ---

func Check(e error) {
	if e != nil {
		panic(e)
	}
}

func HashData(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// BuildMerkleTree: Used by both Encrypt (to create root) and Decrypt (to verify)
func BuildMerkleTree(hashes []string) *MerkleNode {
	var nodes []*MerkleNode
	for _, h := range hashes {
		nodes = append(nodes, &MerkleNode{Hash: h})
	}
	if len(nodes) == 0 {
		return &MerkleNode{Hash: ""}
	}
	return recursiveMerkle(nodes)
}

func recursiveMerkle(nodes []*MerkleNode) *MerkleNode {
	if len(nodes) == 1 {
		return nodes[0]
	}
	var newLevel []*MerkleNode
	for i := 0; i < len(nodes); i += 2 {
		left := nodes[i]
		right := nodes[i]
		if i+1 < len(nodes) {
			right = nodes[i+1]
		}
		hash := HashData([]byte(left.Hash + right.Hash))
		newLevel = append(newLevel, &MerkleNode{Left: left, Right: right, Hash: hash})
	}
	return recursiveMerkle(newLevel)
}
