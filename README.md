# 📦 ChronoVault DSN — Core MVP (Local + Web)

ChronoVault is a functional prototype of the **data layer** for a decentralized storage network. It demonstrates how files are encrypted, shredded into deterministic chunks, stored as content-addressed blobs, and later reconstructed and verified using Merkle roots and original hashes.

This repo includes **two execution modes**:
- **CLI simulation** (local pipeline run): `main.go`, `encrypt.go`, `decrypt.go`
- **Web experience** (upload/retrieve UI + HTTP handlers): `server.go` + `public/`

---

## ✅ What This MVP Does

- Encrypts a file with **AES‑256 GCM**
- Splits encrypted data into **fixed-size chunks** (1KB)
- Stores each chunk under its **SHA‑256 hash** in `./shredded_store/`
- Builds a **Merkle tree** from chunk hashes to produce a **root hash**
- Verifies integrity by recomputing the Merkle root and optional original hash
- Restores the exact original file and serves it to the user

---

## 🧭 Pipeline Overview (End-to-End)

### 1) Upload / Encode / Store

**Source input:** raw file bytes

Steps:
1. **Identity hash** — SHA‑256 of original file (`original_hash`).
2. **Key generation** — 32-byte AES key.
3. **Encryption** — AES‑GCM with random nonce.
4. **Shredding** — encrypted blob split into 1KB chunks.
5. **Content addressing** — each chunk stored as `./shredded_store/<chunk_hash>`.
6. **Merkle root** — calculated from chunk hashes (`root_hash`).
7. **Manifest** — ordered list of chunk hashes + original filename.

Artifacts produced:
- `original_hash` (integrity of plaintext)
- `root_hash` (integrity of encrypted shard set)
- `encryption_key`
- `manifest_content` (order of chunks + filename)

### 2) Retrieve / Decode / Verify

**Inputs required:** root hash + manifest + key (optional: original hash)

Steps:
1. **Load manifest** and extract ordered chunk list.
2. **Reassemble encrypted blob** by reading each chunk file from `./shredded_store/`.
3. **Verify Merkle root** matches submitted `root_hash`.
4. **Decrypt** using AES‑GCM key.
5. **Optional plaintext verification** against `original_hash`.
6. **Output** original file with the **original filename** preserved.

---

## 🌐 Web Flow (server.go + public/)

### Endpoints

- `POST /upload`
	- Input: multipart form with `file`
	- Output JSON:
		```json
		{
			"original_hash": "...",
			"root_hash": "...",
			"encryption_key": "<hex>",
			"file_name": "...",
			"manifest_content": "# Filename: ...\n<hash1>\n<hash2>..."
		}
		```

- `POST /retrieve`
	- Input: multipart form with
		- `roothash_file`
		- `manifest_file`
		- `key_file`
		- optional `original_hash`
	- Output: raw file bytes (download)
	- Response headers:
		- `Content-Disposition`: original filename
		- `X-Integrity-Verified`: `true | false | unavailable`

### Frontend Pages

- `public/index.html` — Swiss-glass marketing/overview layout
- `public/upload.html` — file upload UI, artifact downloads, JSON package export
- `public/retrieve.html` — JSON fast-track + manual retrieval UI

---

## 🖥️ CLI Simulation Flow (main.go)

### Default simulation
- Uses `original.txt` as input.
- Clears and recreates `./shredded_store/`.
- Creates artifacts on disk:
	- `hash_<filename>.txt`
	- `secret_<filename>.key`
	- `roothash_<filename>.txt`
	- `manifest_<filename>`
- Restores the file into `restored_<filename>`.

---

## 📁 Project Structure (Detailed)

| Path | Role | Description |
| --- | --- | --- |
| main.go | Orchestrator | Entry point. Runs CLI simulation or starts web server. Contains hashing + Merkle tree helpers. |
| encrypt.go | Producer | Encrypts, shards, stores chunks, writes artifacts/manifest. |
| decrypt.go | Consumer | Reads artifacts, reassembles chunks, validates Merkle root, decrypts. |
| server.go | Web API | HTTP handlers for upload & retrieve, streams file responses. |
| public/index.html | Landing | Marketing site and product narrative. |
| public/upload.html | Upload UI | Upload file, receive JSON artifacts, download manifest/key/root. |
| public/retrieve.html | Retrieve UI | Upload artifacts or JSON package, verify and download file. |
| shredded_store/ | Storage | Content-addressed encrypted chunks (chunk hash filenames). |

---

## 🔐 Cryptography & Integrity Details

- **Encryption:** AES‑256 GCM
- **Hashing:** SHA‑256
- **Integrity:**
	- **Primary**: Merkle root validation of chunk hashes
	- **Optional**: plaintext hash validation using `original_hash`

If the Merkle root doesn’t match, retrieval is blocked.
If the original hash doesn’t match, the download is still delivered but flagged with `X-Integrity-Verified: false`.

---

## 📦 Artifact Formats

### Manifest (text)
```
# Filename: <original filename>
<chunk_hash_1>
<chunk_hash_2>
...
```

### JSON bundle (from web upload)
```json
{
	"original_hash": "...",
	"root_hash": "...",
	"encryption_key": "<hex>",
	"file_name": "...",
	"manifest_content": "# Filename: ...\n<hash1>..."
}
```

---

## ▶️ Running the Project

### Web Server
Start server and open `http://localhost:8080`:
```
go run . server
```

### CLI Simulation
Run the full encode/store/decode flow:
```
go run .
```

---

## ✅ Expected Outputs

After a successful upload (web or CLI):
- `./shredded_store/` contains chunk files named by SHA‑256 hash.

After successful retrieval:
- The restored file matches the original bytes exactly.

---

## ⚠️ Notes & Current Limitations

- `server.go` does **not** persist artifacts to disk; the UI downloads them.
- Retrieval depends on **existing** chunks in `./shredded_store/`.
- Port conflicts: the web server binds to `:8080` (ensure it’s free).

---

## 🔮 Roadmap

- [x] Phase 1: Local simulation (encrypt, shred, verify)
- [x] Phase 2: Web UI (upload/retrieve)
- [ ] Phase 3: Network transport (P2P/TCP shard exchange)
- [ ] Phase 4: Multi-node distribution & replication
- [ ] Phase 5: On-chain anchoring / consensus proofs