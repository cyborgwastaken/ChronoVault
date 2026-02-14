# 🌌 ChronoVault

A fully decentralized, end-to-end encrypted Web3 storage protocol. ChronoVault shreds, encrypts, and distributes files across the InterPlanetary File System (IPFS), while anchoring absolute cryptographic proof of ownership to the Ethereum (Sepolia) blockchain.

![ChronoVault UI](https://img.shields.io/badge/UI-Glassmorphism-black?style=flat-square&logo=react)
![Network](https://img.shields.io/badge/Network-Ethereum_Sepolia-627EEA?style=flat-square&logo=ethereum)
![Storage](https://img.shields.io/badge/Storage-IPFS_%2F_Pinata-65C2CB?style=flat-square&logo=ipfs)
![Backend](https://img.shields.io/badge/Backend-Go_(Golang)-00ADD8?style=flat-square&logo=go)

---

## 🏗 System Architecture


ChronoVault operates on a zero-knowledge architecture. The server never sees the raw file, and the blockchain only stores immutable mathematical proofs.

1. **The Client (React):** A sleek, glassmorphism UI where users drag and drop files. It connects directly to the user's Web3 wallet (MetaMask).
2. **The Engine (Go):** The backend intercepts the file, applies military-grade AES-GCM encryption, splits it into sharded chunks, and generates a Merkle Tree for integrity verification.
3. **The Swarm (IPFS):** The encrypted chunks are pushed to the decentralized IPFS network via Pinata.
4. **The Ledger (Solidity):** The React frontend prompts MetaMask to execute a Smart Contract transaction, permanently burning the Root Hash, Original Hash, and timestamp to the Ethereum Sepolia testnet.

## ✨ Key Features
* **Zero-Knowledge Encryption:** Files are AES-GCM encrypted *before* distribution. The private `Secret.key` never touches the blockchain.
* **Merkle Tree Verification:** Upon retrieval, chunks are verified against a blockchain-anchored Merkle Root to guarantee zero tampering.
* **Wallet-Bound Authentication:** Users retrieve their artifacts by querying the Smart Contract using their Web3 Identity (MetaMask).
* **Physical-Style Keys:** Access requires two artifacts downloaded at the time of upload: `Manifest.txt` (the IPFS chunk map) and `Secret.key` (the decryption key).

---

## 🛠 Tech Stack
* **Frontend:** React, Vite, Tailwind CSS, Ethers.js
* **Backend:** Go (Golang), `crypto/cipher`, `crypto/aes`
* **Storage:** IPFS, Pinata Cloud API
* **Blockchain:** Solidity, Remix IDE, Sepolia Testnet

---

## 📂 Project Structure

```text
ChronoVault/
├── backend/                  # Go Server Engine
│   ├── main.go               # Server initialization & routes
│   ├── encrypt.go            # AES-GCM encryption & chunking logic
│   ├── decrypt.go            # IPFS retrieval & reconstruction logic
│   ├── ipfs.go               # Pinata API integration
│   ├── merkle.go             # Cryptographic hashing
│   └── pinata.txt            # Pinata JWT Authorization (Ignored in Git)
├── src/                      # React Frontend
│   ├── pages/
│   │   ├── Upload.jsx        # Encryption & Blockchain transaction logic
│   │   ├── Retrieve.jsx      # Web3 Ledger querying & Drag-and-Drop decryption
│   ├── App.jsx               # Routing
│   └── index.css             # Glassmorphism UI variables
└── contracts/
    └── ChronoVault.sol       # Ethereum Smart Contract

```

---

## 🚀 Installation & Setup

### Prerequisites

* [Node.js](https://nodejs.org/) and npm
* [Go (Golang)](https://go.dev/)
* [MetaMask](https://metamask.io/) browser extension configured for the **Sepolia Testnet** with test ETH.
* A free [Pinata Cloud](https://pinata.cloud/) account for IPFS API access.

### 1. Start the Go Backend

1. Navigate to the backend directory.
2. Create a file named `pinata.txt` and paste your raw Pinata JWT token inside it (no spaces, no newlines).
3. Run the Go server:

```bash
go run *.go server

```

*The Web3 DSN Server will start on `http://localhost:8080*`

### 2. Start the React Frontend

1. Open a new terminal and navigate to the project root.
2. Install dependencies:

```bash
npm install
npm install ethers

```

3. Start the Vite development server:

```bash
npm run dev

```

### 3. Smart Contract Configuration

If deploying your own contract:

1. Deploy `ChronoVault.sol` to Sepolia via Remix IDE.
2. Copy the deployed contract address.
3. Update the `CONTRACT_ADDRESS` constant at the top of both `Upload.jsx` and `Retrieve.jsx`.

---

## 🔐 Usage Protocol

### Phase 1: Upload & Secure

1. Connect MetaMask.
2. Drop a file into the Upload Zone.
3. Approve the Sepolia transaction when prompted.
4. **CRITICAL:** Download and securely store your `Manifest.txt` and `Secret.key`.

### Phase 2: Access & Rebuild

1. Navigate to the **Retrieve** page and connect MetaMask.
2. The UI will query the blockchain and display all secured vaults tied to your wallet.
3. Select a vault, drop in your `Manifest.txt` and `Secret.key`, and initiate the rebuild.
4. The backend will pull the chunks from IPFS, verify the Merkle root, decrypt the data, and trigger the download.

---

## 👥 Team

Built as a decentralized network initiative by **Ayushman, Aarushi, Nakshatra, Vishal, Shreena, and Vipransh**.

*Future Roadmap: Implementation of Web 2.5 Relayer Architecture (Account Abstraction) for gasless, wallet-free community access.*

```

