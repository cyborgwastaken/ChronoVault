# ChronoVault v3 — Complete Technical Overview

_Last updated: 2026-03-30_

## 1) Project Purpose

ChronoVault is a full-stack **secure vaulting platform** for file protection and controlled retrieval.

It combines:
- **Client-facing Web3 UX** (React + ethers + MetaMask)
- **Backend cryptographic pipeline** (Go + AES-256-GCM + Merkle integrity)
- **Decentralized storage** (IPFS via Pinata)
- **Identity and metadata plane** (Supabase Auth + Postgres tables + RPCs)
- **Optional biometric gate** (FastAPI + FaceNet embeddings + PIN)

Core promise: users can encrypt, shard, store, and later reconstruct files with cryptographic integrity checks and optional time/geo/biometric controls.

---

## 2) Repository Architecture (Monorepo)

## Top-level modules

- `backend/` — Go server + crypto pipeline + IPFS integration + Python biometric microservice
- `frontend/` — React SPA (Vite) for upload/retrieve/admin/auth workflows
- `ARCHITECTURE.md` — design narrative and modernization notes
- `README.md` — setup and runbook
- `backend/supabase_biometric_migration.sql` — DB migration for biometric vault fields

---

## 3) Technology Stack (Complete)

## 3.1 Frontend stack
- **React 19** (SPA UI)
- **React Router 7** (routing, protected routes)
- **Vite 7** (build/dev)
- **Tailwind CSS v4** + **shadcn/ui patterns** + **Radix primitives** (design system)
- **Framer Motion / motion** (animations)
- **sonner** (toasts)
- **ethers v6** (EVM wallet + contract calls)
- **@supabase/supabase-js v2** (auth, DB reads/writes, RPC calls)
- **react-webcam** (biometric capture)
- **Vitest + Testing Library + jsdom** (tests)

## 3.2 Backend stack
- **Go 1.24.5** main API + crypto pipeline
- Go stdlib crypto: `aes`, `cipher`, `rand`, `sha256`, `hmac`, `ecdsa`
- **joho/godotenv** for env loading
- **Pinata REST APIs** for IPFS pin/unpin/upload/download

## 3.3 Biometric microservice stack
- **Python FastAPI**
- **uvicorn** ASGI server
- **facenet-pytorch** (`MTCNN` + `InceptionResnetV1` pretrained `vggface2`)
- **torch / torchvision**
- **numpy / Pillow**

## 3.4 Data + Auth stack
- **Supabase Auth** (JWT issuing)
- **Supabase Postgres** (`users`, `vaults`, RPC functions)
- JWT verification supports:
  - **ES256 via Supabase JWKS** (primary modern mode)
  - **HS256 shared secret** fallback (`SUPABASE_JWT_SECRET`)

## 3.5 Web3 stack
- **Ethereum Sepolia** (configured by env)
- **MetaMask / `window.ethereum`**
- Smart contract interaction via ABI in frontend

---

## 4) Backend Modules — In-Depth

## 4.1 `backend/main.go`
Role: shared constants, helper functions, Merkle tree logic, CLI simulation launcher.

### Key responsibilities
- Defines `ChunkSize = 256 * 1024` (256 KB)
- Defines logical storage root constant `StoreFolder = "shredded_store"`
- Provides `HashData(data)` => SHA-256 hex
- Provides `BuildMerkleTree(hashes)` and recursive pairwise hash composition
- Entrypoint mode switch:
  - `go run . server` → API server mode
  - default → local simulation (`runSimulation`)

### Methodology note
`BuildMerkleTree` returns `nil` for empty input (intentional hardening against accepting empty manifest integrity roots).

---

## 4.2 `backend/encrypt.go`
Role: encryption + sharding + decentralized upload + manifest generation.

### Core function
`EncryptAndStore(originalData []byte, filename string) (originalHash, rootHash, manifestContent, key, error)`

### Pipeline
1. Compute original file hash (`SHA-256`) for end-to-end identity check.
2. Generate random 32-byte key (AES-256).
3. Encrypt with **AES-GCM** and random nonce.
4. Split encrypted payload into 256 KB chunks.
5. Upload each chunk to IPFS (Pinata), collecting returned CIDs.
6. Build Merkle tree over ordered chunk CID list and derive root hash.
7. Emit manifest text with filename header + ordered CID list.

### Reliability behavior
- Upload retry logic is in IPFS module.
- On partial upload failure, already pinned CIDs are unpinned (best-effort rollback).

---

## 4.3 `backend/decrypt.go`
Role: local simulation restore/decrypt path (file-system based).

### Core function
`DecryptAndRestore(filename string)`

### Steps
1. Read key, expected root, expected original hash, and manifest from local files.
2. Reassemble encrypted payload by reading chunks listed in manifest from `shredded_store/`.
3. Recompute Merkle root and compare with expected root.
4. Decrypt via AES-GCM.
5. Recompute plaintext hash and compare with expected original hash.
6. Save restored file to `restored_<filename>`.

---

## 4.4 `backend/ipfs.go`
Role: Pinata gateway abstraction for upload/download/unpin and CID validation.

### Security mechanisms
- **CID allow-list validation**:
  - CIDv0 regex (`Qm...`)
  - CIDv1 regex (`b...`)
- Rejects unsafe CID strings before any HTTP request.

### Key functions
- `initIPFSConfig()` loads and sanitizes `PINATA_JWT`
- `UploadChunkToIPFS(chunk, filename)` with exponential retry
- `DownloadChunkFromIPFS(cid)` with strict size cap
- `UnpinFromIPFS(cid)` for purge/rollback

### Methodology notes
- Uses shared `http.Client` with timeout.
- Uses bounded reads (`io.LimitReader`) to mitigate oversized payload/OOM risks.

---

## 4.5 `backend/server.go`
Role: production HTTP API and security boundary.

### Exposed endpoints
- `POST /upload` (auth required)
- `POST /retrieve` (auth required)
- `POST /delete` (auth required)

### Middleware chain
`CORS -> Security headers -> Rate limiter -> JWT auth -> Handler`

### Security controls
- Fixed-window per-IP rate limiter (`30 req / 60s`)
- Trusted proxy conditional for `X-Forwarded-For`
- Upload/request cap: `10 MB`
- Strict filename sanitization and control-char stripping
- JWT validation:
  - ES256 signature verification using Supabase JWKS cache
  - HS256 fallback for legacy tokens
  - issuer validation against `SUPABASE_URL/auth/v1`
- Response security headers (`X-Frame-Options`, `nosniff`, etc.)

### Upload API methodology
- Parses multipart `file`
- Executes crypto+IPFS pipeline (`EncryptAndStore`)
- Returns JSON artifacts (`original_hash`, `root_hash`, `manifest_content`, `encryption_key`)
- Zeroes raw key bytes in memory after hex encoding

### Retrieve API methodology
- Accepts manifest + root hash + key file (+ optional original hash)
- Validates every CID in manifest
- Pulls chunks from IPFS in order
- Verifies Merkle root before decryption
- AES-GCM decrypts and streams restored file download
- Optional original hash verification returned via `X-Integrity-Verified`

### Delete API methodology
- Accepts manifest
- Validates CIDs
- Unpins all listed CIDs from Pinata
- Returns `chunks_purged`

---

## 4.6 `backend/biometric_service.py`
Role: dedicated biometric service API.

### Endpoints
- `GET /health`
- `POST /enroll`
- `POST /enroll-batch`
- `POST /verify`

### Runtime design
- Initializes a single `BiometricModel`
- Uses presenter pattern (`BiometricPresenter`) to decouple API layer from model logic
- CORS allowed origin controlled by env

---

## 4.7 `backend/biometric_mvp/model.py`
Role: face embedding extraction and hashing.

### Internals
- Lazy initializes torch + facenet model stack
- Detects face via **MTCNN**
- Embeds via **InceptionResnetV1(vggface2)**
- L2-normalizes embeddings
- Generates stable hash via SHA-256 over rounded float vector bytes

### Enrollment quality method
- Batch mode requires 5 captures
- Averages embeddings then renormalizes (more robust profile)

---

## 4.8 `backend/biometric_mvp/presenter.py`
Role: business logic for enroll/verify outputs.

### Verify method logic
- Parse stored embedding and normalize
- Extract live embedding
- Compute cosine similarity (`dot(live, stored)` after normalization)
- Enforce two checks:
  1. similarity >= threshold
  2. stored embedding hash integrity matches stored hash

Output includes `matched`, `similarity`, hash diagnostics.

---

## 4.9 `backend/biometric_mvp/view.py`
Role: request DTOs (Pydantic models):
- `EnrollRequest`
- `EnrollBatchRequest`
- `VerifyRequest`

Includes threshold bounds (0.1 to 1.0) and typed list payloads.

---

## 5) Frontend Modules — In-Depth

## 5.1 App shell
- `src/main.jsx`: mounts app + `ThemeProvider`
- `src/App.jsx`: router tree + global layout + animated beams background + toaster

### Routes
- `/` Home
- `/login` Login
- `/upload` Protected
- `/retrieve` Protected
- `/admin` Protected admin-only
- `*` NotFound

---

## 5.2 Auth and session module (`src/context/AuthContext.jsx`)

### Responsibilities
- Subscribe to Supabase auth state changes
- Fetch user profile from `users` table
- Expose auth methods:
  - `signInWithGoogle`
  - `signOut`
  - `refreshProfile`
  - `deductCredits` (RPC)
  - `linkWallet`
- Exposes `isAdmin` from `profile.role`

### Methodology
- Includes retry behavior for profile-not-ready condition (`PGRST116`)
- Includes loader safety timeout to prevent hanging auth UI state

---

## 5.3 Supabase client module (`src/lib/supabase.js`)

### Responsibilities
- Instantiate Supabase client from env
- Retrieve active access token
- Provide `authFetch(url, options)` that injects Bearer token

This is the primary bridge for backend authenticated calls.

---

## 5.4 Biometric client module (`src/lib/biometric.js`)

### Responsibilities
- Health check of biometric service
- Enroll single/batch captures
- Verify live biometric against stored profile
- Client-side PIN hashing (`SHA-256`) before persistence/compare

Error handling includes structured fallback parsing of API error payloads.

---

## 5.5 Upload module (`src/pages/Upload.jsx`)

### Capabilities
- Drag/drop file selection
- Optional lock controls:
  - Time lock
  - Geo lock
  - Biometric + PIN enrollment (5 webcam captures)
- Calls backend `/upload`
- Optionally writes blockchain tx (`secureVault`)
- Persists metadata row to Supabase `vaults`
- Deducts credits **after successful pipeline completion**
- Provides downloadable artifacts (`manifest`, `root hash`, `key`, JSON bundle)

### Methodology details
- Enforces max file size (`10MB`, aligned with backend)
- Performs biometric health + batch enrollment only when biometric enabled
- Attempts Sepolia chain switch before contract call
- Tracks transaction status stages for user feedback

---

## 5.6 Retrieve module (`src/pages/Retrieve.jsx`)

### Capabilities
- Fetches vault list from Supabase (user-scoped)
- Optionally fetches on-chain vault records (`getMyVaults`) and cross-validates root hash consistency
- Supports filters: all/standard/time/geo/biometric
- Handles unlock constraints:
  - Timer window check
  - Geo-radius check (~2 km radius via Haversine)
  - Biometric+PIN verification gate
- Calls backend `/retrieve` and streams reconstructed file download
- Calls backend `/delete` for irreversible purge + Supabase row delete

### Important behavior
Credit deduction on retrieval is currently done before final backend response; failed retrieval can still consume credits (implementation tradeoff currently present in code).

---

## 5.7 Admin module (`src/pages/Admin.jsx`)

### Capabilities
- Lists all users
- Computes high-level stats (total users/credits/vault count)
- Grants credits via RPC `admin_grant_credits`
- Toggles roles (`user` <-> `admin`) except self-demotion/promotion guard

---

## 5.8 UI and utility components

- `Navbar.jsx`: nav links, mobile menu, profile menu, credits badge, wallet + theme controls
- `Footer.jsx`: branding
- `ProtectedRoute.jsx`: auth + admin gate
- `WalletButton.jsx`: MetaMask connect/state
- `BiometricCapture.jsx`: camera capture widget
- `ThemeProvider.jsx` and `ModeToggle.jsx`: dark/light handling
- `components/ui/*`: shadcn-like primitives (`button`, `card`, `input`, `label`, `switch`, `sonner`)
- `beams-background.jsx`: animated canvas-based ambient effect

---

## 6) API Surface (Backend)

## 6.1 `POST /upload`
Auth: required (Supabase JWT)

Input: multipart form
- `file`

Output JSON:
- `original_hash`
- `root_hash`
- `encryption_key` (hex)
- `file_name`
- `manifest_content`

## 6.2 `POST /retrieve`
Auth: required

Input: multipart form
- `roothash_file`
- `key_file`
- `manifest_file`
- `original_hash` (optional)

Output: binary file stream + `X-Integrity-Verified` header

## 6.3 `POST /delete`
Auth: required

Input: multipart form
- `manifest_file`

Output JSON:
- `success`
- `chunks_purged`

## 6.4 Biometric service endpoints
- `GET /health`
- `POST /enroll` (single image)
- `POST /enroll-batch` (5 images)
- `POST /verify` (live image + stored embedding/hash + threshold)

---

## 7) Supabase Data Model (Observed + Inferred)

> Note: only biometric migration SQL is present in repo. Base schema below is inferred from application usage.

## 7.1 `public.users` (inferred)
Fields referenced in code:
- `id` (uuid, auth user id)
- `email`
- `full_name`
- `avatar_url`
- `role` (`user` or `admin`)
- `credits` (integer)
- `wallet_address`
- `created_at`

Used by:
- profile loading
- admin dashboard
- wallet linking
- role switching

## 7.2 `public.vaults` (partly inferred, partly explicit)
Core fields used by app:
- `id`
- `user_id`
- `file_name`
- `original_hash`
- `root_hash`
- `manifest_cid` (stores manifest content string)
- `blockchain_tx`
- `timer_enabled`
- `unlock_time`
- `geo_enabled`
- `latitude`
- `longitude`
- `created_at`

Biometric fields (explicit from migration):
- `biometric_enabled boolean not null default false`
- `biometric_hash text`
- `biometric_embedding jsonb`
- `biometric_pin_hash text`
- `biometric_model text`

Migration source: `backend/supabase_biometric_migration.sql`.

## 7.3 RPC functions (inferred from app)
- `deduct_credits(amount, transaction_type, transaction_description)`
  - called during upload/retrieve
  - expected to return JSON/string containing `success` and optional `error`
- `admin_grant_credits(target_user_id, amount, grant_description)`
  - admin-only grant path

## 7.4 Likely supporting objects (inferred)
Given credit economy design, a transaction ledger table is likely present (not included in repo migration files), typically capturing:
- user id
- delta
- type
- description
- timestamp

---

## 8) Smart Contract Structure (Observed + Inferred)

> No Solidity source file (`.sol`) exists in this repository. Contract structure below is reconstructed from ABI usage in frontend.

## 8.1 Observed write method
`secureVault(string _fileName, string _category, string _originalHash, string _rootHash, string _manifestCID)`
- called on upload
- state mutability: `nonpayable`

## 8.2 Observed read method
`getMyVaults() view returns (tuple[] vaults)` where tuple fields are:
- `id uint256`
- `owner address`
- `fileName string`
- `category string`
- `originalHash string`
- `rootHash string`
- `manifestCID string`
- `timestamp uint256`
- `isActive bool`

## 8.3 Implied contract data model (inferred)
Likely Solidity struct:
- `Vault { id, owner, fileName, category, originalHash, rootHash, manifestCID, timestamp, isActive }`

Likely mappings/arrays:
- owner to vault ids
- global vault storage by id

## 8.4 Current integration state
- Upload writes on-chain with placeholder `"PENDING_MANIFEST_CID"` for manifest CID
- Retrieval performs chain-vs-Supabase root-hash consistency check when blockchain query succeeds
- On-chain dataset is treated as integrity anchor for root hash

---

## 9) End-to-End Methodologies

## 9.1 Cryptographic methodology
- Confidentiality: AES-256-GCM
- Integrity #1: Merkle root over ordered chunk CIDs
- Integrity #2: full plaintext SHA-256 identity hash

## 9.2 Storage methodology
- Ciphertext chunking (256KB)
- Content-addressing by IPFS CIDs
- Manifest retains chunk order and filename metadata

## 9.3 Identity/Auth methodology
- Supabase OAuth login (Google)
- JWT from Supabase attached to backend requests
- Backend verifies JWT cryptographically (ES256 JWKS preferred)

## 9.4 Access control methodology
- Frontend route gates (`ProtectedRoute`)
- Backend enforces auth on all sensitive endpoints
- Admin controls via role field
- Optional secondary constraints:
  - time lock
  - geo lock
  - biometric+PIN

## 9.5 Biometric methodology
- Multi-capture enrollment (5 samples)
- embedding averaging + normalization
- stored embedding hash for tamper detection
- verify = similarity threshold AND integrity checks AND PIN hash match

## 9.6 Economic methodology
- Credits as anti-abuse and metering layer
- upload cost: 40 credits
- retrieve cost: 10 credits
- admin can grant credits via RPC

---

## 10) Configuration and Environment Variables

## Backend (Go)
- `PINATA_JWT`
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET` (legacy HS256 fallback)
- `ALLOWED_ORIGIN`
- `TRUSTED_PROXY` (optional CIDR)

## Biometric service (Python)
- `BIOMETRIC_THRESHOLD` (default 0.72)
- `ALLOWED_ORIGIN`

## Frontend (Vite)
- `VITE_BACKEND_URL`
- `VITE_BIOMETRIC_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CONTRACT_ADDRESS`
- `VITE_SEPOLIA_CHAIN_ID`

---

## 11) Testing and Quality Tooling

- Unit/component tests exist for core UI and route protection (`Button`, `ProtectedRoute`).
- Linting via ESLint flat config.
- Build/test stack via Vite + Vitest + jsdom.

---

## 12) Security Posture Summary

Implemented safeguards include:
- authenticated backend endpoints
- JWT signature verification with modern JWKS support
- rate limiting
- strict CID validation
- bounded upload/download sizes
- filename sanitization
- dual integrity verification (Merkle + plaintext hash)
- best-effort IPFS rollback on upload failure

Known architectural caveats:
- Smart contract source is not versioned in repo (auditability gap).
- Retrieve flow deducts credits before backend success confirmation.
- Base Supabase schema migrations (users/vaults/RPC definitions) are not fully included in repo; only biometric extension migration is provided.

---

## 13) Module Inventory (Quick Index)

### Backend
- `main.go` — app mode + shared crypto utilities
- `encrypt.go` — encrypt/shard/upload
- `decrypt.go` — local restore/decrypt simulation
- `ipfs.go` — Pinata interface
- `server.go` — secured HTTP server
- `biometric_service.py` — biometric API service
- `biometric_mvp/model.py` — embedding extraction
- `biometric_mvp/presenter.py` — biometric business logic
- `biometric_mvp/view.py` — request schemas
- `supabase_biometric_migration.sql` — DB extension for biometric vaults

### Frontend
- `src/App.jsx`, `src/main.jsx` — app shell + routing
- `src/context/AuthContext.jsx` — auth/session/credits logic
- `src/lib/supabase.js` — supabase client + authenticated fetch
- `src/lib/biometric.js` — biometric API helper
- `src/pages/*.jsx` — feature pages (`Home`, `Upload`, `Retrieve`, `Login`, `Admin`, `NotFound`)
- `src/components/*.jsx` — route guard, nav, wallet, biometric capture, theme
- `src/components/ui/*.jsx` — reusable primitive UI elements

---

## 14) Final Operational View

ChronoVault is a layered architecture where:
- **Go backend** enforces cryptographic correctness and secure transport behavior,
- **React frontend** orchestrates user policy controls and UX,
- **Supabase** carries identity + metadata + credit economics,
- **IPFS** carries encrypted chunks,
- **Ethereum contract** stores verifiable vault metadata anchors,
- **Python biometric service** adds optional high-assurance unlock gating.

This gives the system defense-in-depth across confidentiality, integrity, identity, and controlled availability.
