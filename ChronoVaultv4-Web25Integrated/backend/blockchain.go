package main

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// --- BLOCKCHAIN CONFIGURATION ---
// We use a public free RPC for Sepolia so you don't have to create an Alchemy account yet.
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"

// DO NOT SHARE THIS PRIVATE KEY. This is your startup's master wallet that pays gas for users.
const MASTER_KEY = "2191282A6ef15219DBf46f1BeD33185d5e8B9517"

// The V2 Contract address you deployed earlier
const CONTRACT_ADDRESS = "0x551Df3762c81604EAfFb4A82A7d0ff9F71CFF5bF"

// The exact ABI definition for the secureVault function from your V2 Smart Contract
const contractABI = `[{"inputs":[{"internalType":"string","name":"_fileName","type":"string"},{"internalType":"string","name":"_category","type":"string"},{"internalType":"string","name":"_originalHash","type":"string"},{"internalType":"string","name":"_rootHash","type":"string"},{"internalType":"string","name":"_manifestCID","type":"string"}],"name":"secureVault","outputs":[],"stateMutability":"nonpayable","type":"function"}]`

func AnchorToBlockchain(fileName, category, originalHash, rootHash, manifestCID string) (string, error) {
	fmt.Println("⛓️ [Ledger] Initiating Master Wallet Transaction...")

	// 1. Connect to the Ethereum Network
	client, err := ethclient.Dial(RPC_URL)
	if err != nil {
		return "", fmt.Errorf("failed to connect to Ethereum RPC: %v", err)
	}

	// 2. Load the Master Wallet Private Key
	privateKey, err := crypto.HexToECDSA(MASTER_KEY)
	if err != nil {
		return "", fmt.Errorf("invalid private key: %v", err)
	}
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return "", fmt.Errorf("error casting public key to ECDSA")
	}

	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	// 3. Get Network Gas Price and Account Nonce
	nonce, err := client.PendingNonceAt(context.Background(), fromAddress)
	if err != nil {
		return "", err
	}
	gasPrice, err := client.SuggestGasPrice(context.Background())
	if err != nil {
		return "", err
	}

	// 4. Pack the Smart Contract Arguments
	parsedABI, err := abi.JSON(strings.NewReader(contractABI))
	if err != nil {
		return "", err
	}
	data, err := parsedABI.Pack("secureVault", fileName, category, originalHash, rootHash, manifestCID)
	if err != nil {
		return "", err
	}

	// 5. Create the Transaction
	toAddress := common.HexToAddress(CONTRACT_ADDRESS)
	tx := types.NewTransaction(nonce, toAddress, big.NewInt(0), uint64(3000000), gasPrice, data)
	chainID, err := client.NetworkID(context.Background())
	if err != nil {
		return "", err
	}

	// 6. Sign and Send the Transaction
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
	if err != nil {
		return "", err
	}
	err = client.SendTransaction(context.Background(), signedTx)
	if err != nil {
		return "", err
	}

	txHash := signedTx.Hash().Hex()
	fmt.Printf("✅ [Ledger] Anchored to Sepolia! TX Hash: %s\n", txHash)

	return txHash, nil
}
