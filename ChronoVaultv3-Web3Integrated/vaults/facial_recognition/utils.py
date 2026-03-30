# ============================================================================
# ChronoVault - Facial Recognition Vault | Security Utilities
# ============================================================================
# Shared cryptographic primitives for embedding encryption at rest.
# Uses Python's standard library `hashlib` and `os` for PBKDF2,
# and the `cryptography` package for AES-256-GCM.
#
# SECURITY NOTE: We use Python's built-in crypto rather than PyCryptodome
# because `hashlib.pbkdf2_hmac` is a C-extension (fast & audited) and
# AES-GCM is provided by the `cryptography` library backed by OpenSSL.
# However, for the MVP we use the built-in `os` + `hashlib` + raw AES
# from the standard library to avoid extra dependencies.
# ============================================================================

import gc
import hashlib
import os
import struct
from typing import Optional

from config import (
    AES_GCM_NONCE_LENGTH,
    DERIVED_KEY_LENGTH,
    PBKDF2_ITERATIONS,
    PBKDF2_SALT_LENGTH,
)


# ============================================================================
# KEY DERIVATION
# ============================================================================


def derive_key(password: str, salt: bytes) -> bytes:
    """
    Derive a 256-bit encryption key from a user-provided password/PIN
    using PBKDF2-HMAC-SHA256.

    Args:
        password: User's vault PIN or password (plaintext string).
        salt: Cryptographically random salt (must be stored alongside ciphertext).

    Returns:
        32-byte derived key suitable for AES-256.

    Security:
        - 600K iterations makes brute-force attacks computationally expensive
        - Each enrollment generates a unique random salt
        - The password itself is never stored
    """
    return hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=password.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
        dklen=DERIVED_KEY_LENGTH,
    )


def generate_salt() -> bytes:
    """Generate a cryptographically secure random salt for PBKDF2."""
    return os.urandom(PBKDF2_SALT_LENGTH)


# ============================================================================
# AES-256-GCM ENCRYPTION / DECRYPTION
# ============================================================================
# We implement AES-GCM using Python's built-in `cryptography` would be ideal,
# but to minimize dependencies we use a pure approach with the `cryptography`
# library that ships with most Python installations.
#
# File format: [salt (32B)] [nonce (12B)] [tag (16B)] [ciphertext (variable)]
# ============================================================================


def encrypt_bytes(plaintext: bytes, password: str) -> bytes:
    """
    Encrypt arbitrary bytes using AES-256-GCM with a password-derived key.

    The output is a self-contained blob:
        [salt (32 bytes)] [nonce (12 bytes)] [tag (16 bytes)] [ciphertext]

    Args:
        plaintext: The raw bytes to encrypt (e.g., serialized embedding).
        password: User's vault PIN used for key derivation.

    Returns:
        Encrypted blob containing all fields needed for decryption.
    """
    # Import here to keep it optional until actually used
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    # 1. Generate fresh salt and derive key
    salt = generate_salt()
    key = derive_key(password, salt)

    # 2. Generate random nonce (NIST recommends 96-bit for GCM)
    nonce = os.urandom(AES_GCM_NONCE_LENGTH)

    # 3. Encrypt with AES-256-GCM (provides both confidentiality & integrity)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)

    # 4. Pack into single blob: salt || nonce || ciphertext+tag
    blob = salt + nonce + ciphertext_with_tag

    # 5. Scrub the derived key from memory
    secure_delete_bytes(key)

    return blob


def decrypt_bytes(blob: bytes, password: str) -> Optional[bytes]:
    """
    Decrypt an AES-256-GCM encrypted blob using a password-derived key.

    Args:
        blob: The encrypted blob from encrypt_bytes().
        password: User's vault PIN for key derivation.

    Returns:
        Decrypted plaintext bytes, or None if authentication fails
        (wrong password or tampered data).
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.exceptions import InvalidTag

    # 1. Parse the blob fields
    salt_end = PBKDF2_SALT_LENGTH
    nonce_end = salt_end + AES_GCM_NONCE_LENGTH

    if len(blob) < nonce_end + 16:  # Minimum: salt + nonce + 16-byte tag
        print("[Security] [FAIL] Encrypted blob is too short - possible corruption")
        return None

    salt = blob[:salt_end]
    nonce = blob[salt_end:nonce_end]
    ciphertext_with_tag = blob[nonce_end:]

    # 2. Derive key from password + stored salt
    key = derive_key(password, salt)

    # 3. Attempt decryption (will fail with InvalidTag if wrong password)
    try:
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext_with_tag, None)
    except InvalidTag:
        print("[Security] [FAIL] Authentication failed - wrong PIN or tampered data")
        return None
    finally:
        # Always scrub the key, even on failure
        secure_delete_bytes(key)

    return plaintext


# ============================================================================
# MEMORY SECURITY
# ============================================================================


def secure_delete_bytes(data: bytes) -> None:
    """
    Best-effort attempt to scrub sensitive bytes from memory.

    WARNING: Python's immutable bytes type makes true secure deletion
    impossible in pure Python. This is a defense-in-depth measure.
    For production, use a C-extension or ctypes to overwrite memory.

    What we do:
        1. Delete the Python reference
        2. Force garbage collection to reclaim the memory sooner
    """
    del data
    gc.collect()


def secure_delete(obj) -> None:
    """
    Generic secure deletion for any Python object.
    Deletes reference and forces garbage collection.
    """
    del obj
    gc.collect()


# ============================================================================
# LOGGING
# ============================================================================


def log_audit_event(event_type: str, user_id: str, details: str = "") -> None:
    """
    Append an audit event to the local audit log.
    This log tracks enrollment and unlock attempts for security review.

    Args:
        event_type: Type of event (ENROLL, VERIFY_SUCCESS, VERIFY_FAIL, LOCKOUT)
        user_id: The vault user identifier
        details: Additional context (similarity score, etc.)
    """
    import datetime
    from config import AUDIT_LOG_PATH

    timestamp = datetime.datetime.now().isoformat()
    log_line = f"[{timestamp}] [{event_type}] user={user_id} {details}\n"

    # Ensure data directory exists
    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)

    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(log_line)
