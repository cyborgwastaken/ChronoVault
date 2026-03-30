# ============================================================================
# ChronoVault — Facial Recognition Vault | Encrypted Embedding Storage
# ============================================================================
# Handles secure persistence of face embeddings to the local filesystem.
#
# Storage Architecture:
#   - Each enrolled user gets a file: data/{user_id}.vault
#   - The file contains the AES-256-GCM encrypted embedding
#   - The encryption key is derived from the user's PIN via PBKDF2
#   - The salt is stored alongside the ciphertext (not secret, but unique)
#
# Threat Model:
#   - Attacker gains filesystem access → encrypted blob is useless without PIN
#   - Attacker captures PIN → useless without the encrypted .vault file
#   - Both needed simultaneously → two-factor protection at rest
#
# This module is the bridge between the neural network output and the
# cryptographic storage layer.
# ============================================================================

import io
import os
from typing import Optional

import numpy as np
import torch

from config import DATA_DIR, EMBEDDING_DIM
from utils import decrypt_bytes, encrypt_bytes, log_audit_event, secure_delete


class EmbeddingStore:
    """
    Encrypted local storage for facial recognition embeddings.

    Provides save/load operations that transparently encrypt and decrypt
    embeddings using a user-provided PIN. No plaintext embeddings are
    ever written to disk.
    """

    def __init__(self):
        """Ensure the data directory exists."""
        os.makedirs(DATA_DIR, exist_ok=True)
        print(f"[Store] 📁 Embedding store initialized at: {DATA_DIR}")

    def _vault_path(self, user_id: str) -> str:
        """
        Get the filesystem path for a user's encrypted vault file.

        Args:
            user_id: The unique identifier for the enrolled user.

        Returns:
            Absolute path to the .vault file.
        """
        # Sanitize user_id to prevent path traversal attacks
        safe_id = "".join(c for c in user_id if c.isalnum() or c in "-_")
        if not safe_id:
            raise ValueError("Invalid user_id: must contain alphanumeric characters")
        return os.path.join(DATA_DIR, f"{safe_id}.vault")

    def user_exists(self, user_id: str) -> bool:
        """Check if an enrollment exists for the given user."""
        return os.path.exists(self._vault_path(user_id))

    def save_embedding(
        self, embedding: torch.Tensor, user_id: str, password: str
    ) -> bool:
        """
        Encrypt and save a face embedding to the local vault store.

        Pipeline:
            1. Validate embedding dimensions (must be 512-D)
            2. Serialize tensor to raw bytes via numpy
            3. Encrypt bytes with AES-256-GCM (key derived from password)
            4. Write encrypted blob to data/{user_id}.vault
            5. Scrub plaintext embedding bytes from memory

        Args:
            embedding: The averaged face embedding tensor, shape (512,).
            user_id: Unique identifier for this enrollment.
            password: User's vault PIN for encryption key derivation.

        Returns:
            True if saved successfully, False otherwise.
        """
        try:
            # 1. Validate embedding shape
            if embedding.shape != (EMBEDDING_DIM,):
                print(
                    f"[Store] ❌ Invalid embedding shape: {embedding.shape} "
                    f"(expected ({EMBEDDING_DIM},))"
                )
                return False

            # 2. Serialize embedding to bytes
            #    We use numpy's binary format for compact, lossless serialization.
            #    float32 × 512 = 2048 bytes of plaintext.
            embedding_np = embedding.cpu().detach().numpy().astype(np.float32)
            buffer = io.BytesIO()
            np.save(buffer, embedding_np)
            plaintext_bytes = buffer.getvalue()

            # 3. Encrypt with AES-256-GCM
            encrypted_blob = encrypt_bytes(plaintext_bytes, password)

            # 4. Write to disk
            vault_path = self._vault_path(user_id)
            with open(vault_path, "wb") as f:
                f.write(encrypted_blob)

            # 5. Scrub plaintext from memory
            secure_delete(plaintext_bytes)
            secure_delete(embedding_np)

            file_size = os.path.getsize(vault_path)
            print(f"[Store] ✅ Embedding saved: {vault_path} ({file_size} bytes)")
            log_audit_event("ENROLL", user_id, f"vault_file={vault_path}")

            return True

        except Exception as e:
            print(f"[Store] ❌ Failed to save embedding: {e}")
            return False

    def load_embedding(
        self, user_id: str, password: str
    ) -> Optional[torch.Tensor]:
        """
        Load and decrypt a stored face embedding.

        Pipeline:
            1. Read encrypted blob from data/{user_id}.vault
            2. Decrypt with AES-256-GCM (key derived from password)
            3. Deserialize bytes back to tensor
            4. Validate embedding dimensions

        Args:
            user_id: The enrolled user's identifier.
            password: The vault PIN used during enrollment.

        Returns:
            The face embedding tensor of shape (512,), or None if:
                - User not enrolled
                - Wrong password (AES-GCM auth tag mismatch)
                - Corrupted/tampered vault file
        """
        vault_path = self._vault_path(user_id)

        # 1. Check enrollment exists
        if not os.path.exists(vault_path):
            print(f"[Store] ❌ No enrollment found for user '{user_id}'")
            return None

        try:
            # 2. Read encrypted blob
            with open(vault_path, "rb") as f:
                encrypted_blob = f.read()

            # 3. Decrypt (returns None if wrong password)
            plaintext_bytes = decrypt_bytes(encrypted_blob, password)
            if plaintext_bytes is None:
                log_audit_event(
                    "VERIFY_FAIL", user_id, "reason=wrong_pin_or_tampered"
                )
                return None

            # 4. Deserialize back to numpy array, then to tensor
            buffer = io.BytesIO(plaintext_bytes)
            embedding_np = np.load(buffer)
            embedding = torch.from_numpy(embedding_np).float()

            # 5. Validate shape
            if embedding.shape != (EMBEDDING_DIM,):
                print(
                    f"[Store] ❌ Loaded embedding has wrong shape: {embedding.shape}"
                )
                return None

            # 6. Scrub plaintext bytes
            secure_delete(plaintext_bytes)

            print(f"[Store] ✅ Embedding loaded and decrypted for user '{user_id}'")
            return embedding

        except Exception as e:
            print(f"[Store] ❌ Failed to load embedding: {e}")
            return None

    def delete_enrollment(self, user_id: str) -> bool:
        """
        Delete a user's enrollment (e.g., for re-enrollment).

        Args:
            user_id: The user to un-enroll.

        Returns:
            True if deleted, False if not found.
        """
        vault_path = self._vault_path(user_id)
        if os.path.exists(vault_path):
            os.remove(vault_path)
            log_audit_event("DELETE", user_id, f"vault_file={vault_path}")
            print(f"[Store] 🗑️  Enrollment deleted for user '{user_id}'")
            return True
        print(f"[Store] ⚠️  No enrollment found for user '{user_id}'")
        return False
