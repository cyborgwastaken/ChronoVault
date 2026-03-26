package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
)

const PinataAPI = "https://api.pinata.cloud/pinning/pinFileToIPFS"

type PinataResponse struct {
	IpfsHash string `json:"IpfsHash"`
}

// PushToSwarm uploads the AES-encrypted binary to the decentralized IPFS network
func PushToSwarm(encryptedData []byte, filename string, jwt string) (string, error) {
	fmt.Println("🌐 [Swarm] Pushing encrypted artifact to IPFS via Pinata...")

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Attach the raw encrypted bytes as a file
	part, err := writer.CreateFormFile("file", filename+".encrypted")
	if err != nil {
		return "", err
	}
	part.Write(encryptedData)
	writer.Close()

	// Build the HTTP POST request to Pinata
	req, err := http.NewRequest("POST", PinataAPI, body)
	if err != nil {
		return "", err
	}

	// Inject our Pinata JWT for authorization
	req.Header.Add("Authorization", "Bearer "+jwt)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Execute the Swarm Push
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	// Catch any Pinata API errors
	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Pinata rejected the upload: %s", string(respBody))
	}

	// Parse the resulting IPFS CID (The cryptographic address)
	var pinataResp PinataResponse
	json.NewDecoder(resp.Body).Decode(&pinataResp)

	fmt.Printf("✅ [Swarm] Artifact secured on IPFS! CID: %s\n", pinataResp.IpfsHash)
	return pinataResp.IpfsHash, nil
}
