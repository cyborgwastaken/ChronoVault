# ChronoVault Protocol Redesign: Architectural Summary

## Overview

The ChronoVault project has been successfully redesigned into a modern, production-ready system. The application leverages a zero-knowledge architecture integrating fully decentralized on-chain storage with an encrypted off-chain backend and a polished web3 interface.

## 1. UI/UX Modernization

### Design System (Tailwind v4 & Shadcn/UI)
The entire application has been migrated from custom CSS to **Tailwind CSS v4** combined with **Shadcn UI** components.
- **Theme Support:** Implementation of a persistent, centralized Theme Provider mapped to Radix UI primitive variables (`hsl(var(...))`). The default is set to a sleek dark mode.
- **Responsive Layout:** Replaced rigid grid-based layouts with flexbox and tailwind grid utilities, ensuring mobile compatibility.
- **Glassmorphism:** Substituted legacy classes with Tailwind combinations (e.g., `bg-background/50 backdrop-blur-sm`).

### Key UI Features
- **Landing Page (`Home.jsx`):** Features dynamic background effects, intuitive CTA buttons, and detailed architectural feature cards using `lucide-react` iconography.
- **Upload (`Upload.jsx`):** Redesigned the data ingestion flow utilizing unified, card-based steps combining Time-Lock and Geo-Lock configuration directly alongside the blockchain upload mechanism.
- **Notifications (`sonner`):** Migrated from `react-toastify` to `sonner` for rich, non-intrusive toast messages describing blockchain status limits and transaction successes.

## 2. Component Refactoring & File Structure

The project was mapped into a stricter layout compliant with modern standard Next/Vite patterns:
- `/src/components/ui/*`: Isolated, standardized Shadcn primitive elements (Buttons, Cards, Inputs, Toasts, etc.).
- `/src/pages/*`: Route-specific complex layouts combining smaller pieces. All routing logic is protected via an updated `ProtectedRoute.jsx`.

Legacy redundant route definitions (`GeoLockUpload.js`, `TimeLockUpload.js`) were eliminated and integrated back into a superior single-page workflow on `Upload.jsx`.

## 3. Blockchain & Web3 Security

**Strict Role Access Validation**
ChronoVault combines an off-chain data shredding pipeline (Supabase/IPFS) with strict Smart Contract execution logic on Ethereum (Sepolia). 
- Validates the `window.ethereum` state explicitly before initiating the protocol.
- Captures smart contract transactions alongside Supabase entries for cross-referencing.

## 4. Testing Suite

The testing infrastructure runs on **Vitest** paired with **React Testing Library**.
- Run `npm run test` or `npx vitest` to execute the suite.
- Current tests validate internal logic of foundational Shadcn components and deeply check routing permissions via `ProtectedRoute.test.jsx`.

## 5. Build and Deployment Instructions

### Prerequisites
- Node.js environment >= 18.x
- Supabase project credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Ethereum Provider/RPC setup with deployed Sepolia contract matching `VITE_CONTRACT_ADDRESS`

### Running the Environment
1. Clone the repository and navigate into the `frontend` folder.
2. Ensure you install dependencies using: `npm install`
3. Verify tests are green before deployment:
   ```bash
   npx vitest run
   ```
4. Build the static production bundle using Vite (now fully compliant with Tailwind PostCSS settings):
   ```bash
   npm run build
   ```
5. Deploy `frontend/dist` using your provider of choice (e.g., Vercel, Netlify, Cloudflare Pages). Backend requires `.env` configurations as structured in the backend `.env.example`.

### Testing

Run `npm run test` or `npx vitest` in the `frontend` directory.

- Unit Tests: Verify Shadcn UI component hooks correctly.
- Integration tests mock `AuthContext` to ensure the routing layout handles authenticated and anonymous users natively.
