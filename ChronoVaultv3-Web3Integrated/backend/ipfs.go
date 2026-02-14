package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
)

// Helper to grab your JWT and aggressively strip hidden characters
func getPinataJWT() string {
	data, err := os.ReadFile("pinata.txt")
	if err != nil {
		fmt.Println("⚠️  WARNING: Could not read pinata.txt. Make sure it is in the backend folder.")
		return ""
	}

	// Aggressively clean the string of all spaces, tabs, and newlines
	jwt := string(data)
	jwt = strings.ReplaceAll(jwt, "\n", "")
	jwt = strings.ReplaceAll(jwt, "\r", "")
	jwt = strings.ReplaceAll(jwt, "\t", "")
	jwt = strings.ReplaceAll(jwt, " ", "")

	return jwt
}

// UploadChunkToIPFS pushes a byte slice to the global IPFS network
func UploadChunkToIPFS(chunk []byte, filename string) (string, error) {
	jwt := getPinataJWT()
	if jwt == "" {
		return "", fmt.Errorf("missing JWT")
	}

	// Prepare the multipart form data required by Pinata
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", filename)
	part.Write(chunk)
	writer.Close()

	// Send to Pinata
	req, err := http.NewRequest("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS", body)
	if err != nil {
		return "", err
	}
	req.Header.Add("Authorization", "Bearer "+jwt)
	req.Header.Add("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// Parse the response to extract the CID (IpfsHash)
	var result map[string]interface{}
	json.Unmarshal(respBody, &result)

	if cid, ok := result["IpfsHash"].(string); ok {
		fmt.Printf("   [IPFS] Pinned Chunk CID: %s\n", cid)
		return cid, nil
	}

	return "", fmt.Errorf("failed to upload: %s", string(respBody))
}

// DownloadChunkFromIPFS fetches a chunk back from the decentralized network
func DownloadChunkFromIPFS(cid string) ([]byte, error) {
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
