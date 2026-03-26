# ChronoVault

ChronoVault is a full-stack demo that shreds, encrypts, and reconstructs files using AES-GCM, chunk hashing, and a Merkle root for integrity verification. The backend is written in Go, and the frontend is a React + Vite UI for uploading and retrieving artifacts.

## What is included

- Go backend that runs either a CLI simulation or an HTTP server
- React frontend for upload and retrieval flows
- Local sharded store folder used to simulate decentralized storage

## Requirements

- Go 1.24.5 or newer
- Node.js 20+ (recommended)
- npm (bundled with Node.js)

## Quick start (local)

### 1) Start the Go backend (HTTP server)

```bash
cd backend
go run . server
```

The server listens on `http://localhost:8080` and exposes:

- `POST /upload` for encryption + chunk storage + manifest generation
- `POST /retrieve` for reconstruction + verification + decryption

### 2) Start the React frontend

```bash
cd frontend
npm install
npm run dev
```

Open the dev URL Vite prints (usually `http://localhost:5173`).

## CLI simulation (backend only)

The CLI simulation runs a local pipeline without the UI. It creates `original.txt` if it does not exist, encrypts it, shards it, and then restores it.

```bash
cd backend
go run .
```

Generated artifacts in the backend folder:

- `secret_<filename>.key` (raw 32-byte AES key)
- `hash_<filename>.txt` (SHA-256 of original data)
- `roothash_<filename>.txt` (Merkle root of chunk hashes)
- `manifest_<filename>` (ordered list of chunk hashes)
- `restored_<filename>` (decrypted output)

## Web pipeline (frontend + backend)

### Upload flow

1. User selects a file in the UI.
2. Frontend posts the file to `POST /upload`.
3. Backend encrypts and shards the file, then returns artifacts.
4. Frontend lets the user download:
	- `manifest_*.txt`
	- `roothash_*.txt`
	- `secret_*.key`
	- optional `artifacts_*.json` bundle

### Retrieve flow

1. User uploads the JSON artifacts file, or the 3 manual files.
2. Frontend posts artifacts to `POST /retrieve`.
3. Backend reconstructs, verifies, and decrypts the file.
4. Frontend downloads the restored file and reports verification status.

## Encryption and decryption pipeline (Go)

The core pipeline lives in the backend Go files:

- [backend/encrypt.go](backend/encrypt.go)
- [backend/decrypt.go](backend/decrypt.go)
- [backend/main.go](backend/main.go)
- [backend/server.go](backend/server.go)

### Encryption pipeline

The encryption pipeline is implemented in `EncryptAndStore()` in [backend/encrypt.go](backend/encrypt.go).

1. **Identity hash**
	- SHA-256 hash of the original data is computed via `HashData()` in [backend/main.go](backend/main.go).
	- Stored as `hash_<filename>.txt` for later verification.

2. **Key generation**
	- A 32-byte random key is generated for AES-256.
	- Stored as `secret_<filename>.key` (raw bytes in CLI mode).

3. **AES-GCM encryption**
	- AES block cipher + GCM mode with a random nonce.
	- Nonce is prepended to the ciphertext for later decryption.

4. **Shred into chunks**
	- Encrypted data is split into 256KB chunks.
	- Each chunk is SHA-256 hashed and stored under `backend/shredded_store/<hash>`.

5. **Merkle root**
	- Chunk hashes are combined into a Merkle tree via `BuildMerkleTree()` in [backend/main.go](backend/main.go).
	- The root hash is saved as `roothash_<filename>.txt`.

6. **Manifest generation**
	- The ordered list of chunk hashes is written to `manifest_<filename>`.
	- The manifest includes a filename header to preserve the original name.

The HTTP upload handler in [backend/server.go](backend/server.go) performs the same steps, but returns artifacts as JSON (including a hex-encoded key).

### Decryption pipeline

The decryption pipeline is implemented in `DecryptAndRestore()` in [backend/decrypt.go](backend/decrypt.go).

1. **Load metadata**
	- Reads the key, expected Merkle root, original hash, and manifest.

2. **Reassemble encrypted data**
	- Reads each chunk in manifest order from `shredded_store` and concatenates them.

3. **Merkle root verification**
	- Recomputes the Merkle root from the loaded chunk hashes.
	- Aborts if the root does not match the expected root.

4. **AES-GCM decryption**
	- Extracts the nonce from the start of the encrypted blob.
	- Decrypts using the AES-256 key.

5. **Original hash verification**
	- Hashes the decrypted data and compares to the original hash.
	- Aborts if the hash does not match.

6. **Restore output**
	- Writes `restored_<filename>` to disk.

The HTTP retrieve handler in [backend/server.go](backend/server.go) mirrors this flow and streams the restored file as a download. It also sets an `X-Integrity-Verified` header when an original hash is provided.

## Notes and defaults

- Chunk size is fixed at 256KB (`ChunkSize` constant in [backend/main.go](backend/main.go)).
- Sharded chunks are stored under `backend/shredded_store`.
- The web upload uses hex-encoded keys; the CLI uses raw bytes.

## Troubleshooting

- If upload fails, make sure the Go server is running on port 8080.
- If retrieve fails with integrity errors, ensure the manifest and root hash match the uploaded file.
- If decryption fails, verify that the key file is correct and unmodified.

## Development scripts

Frontend scripts are defined in [frontend/package.json](frontend/package.json):

- `npm run dev` starts Vite
- `npm run build` builds the static app
- `npm run preview` serves the build
- `npm run lint` runs ESLint