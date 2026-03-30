# ============================================================================
# ChronoVault — Facial Recognition Vault | Mock Vault Unlock
# ============================================================================
# Simulates the AES decryption key release that occurs when the facial
# recognition vault conditions are met.
#
# In the FULL ChronoVault architecture (post Phase 3):
#   1. verify.py confirms face match locally
#   2. A ZK proof is generated (Step 5) proving the match happened correctly
#   3. The ZK proof is submitted to the on-chain verifier contract (Step 6)
#   4. The smart contract releases the AES key (or key shard)
#
# For this MVP, we simulate step 4 with a mock key generation, but the
# output payload is structured EXACTLY as the future ZKML pipeline expects.
# This makes the eventual integration seamless.
# ============================================================================

import datetime
import json
import os
import secrets

from utils import log_audit_event


def mock_unlock(user_id: str, similarity_score: float) -> dict:
    """
    Simulate an AES-256 decryption key release upon successful face verification.

    This function represents the "reward" at the end of the vault pipeline.
    Once the Siamese network confirms the user's identity, the vault releases
    the encryption key needed to decrypt the stored ChronoVault file.

    Args:
        user_id: The verified user's identifier.
        similarity_score: The cosine similarity score that triggered the unlock.

    Returns:
        A structured unlock payload dict containing:
            - status: "VAULT_UNLOCKED"
            - user_id: The verified user
            - similarity_score: Match confidence
            - mock_aes_key: A randomly generated 256-bit key (hex-encoded)
            - timestamp: ISO-8601 unlock time
            - unlock_method: Vault type identifier
            - zkml_ready: False (will be True after Step 5 integration)
            - proof_hash: Placeholder for future ZK proof hash

    Security Notes:
        - The mock_aes_key is randomly generated each call (not persistent).
        - In production, the real AES key would be retrieved from the smart
          contract after ZK proof verification on-chain.
        - The unlock event is logged to the local audit trail.
    """
    # Generate a mock AES-256 key (32 bytes = 256 bits)
    mock_key = secrets.token_hex(32)  # 64 hex characters

    # Build the unlock payload
    # This structure mirrors the future ZKML pipeline output
    payload = {
        "status": "VAULT_UNLOCKED",
        "user_id": user_id,
        "similarity_score": round(similarity_score, 6),
        "mock_aes_key": mock_key,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "unlock_method": "facial_recognition_v1",
        "zkml_ready": False,  # Will flip to True after Step 5 (EZKL circuit)
        "proof_hash": None,   # Will contain ZK-SNARK proof hash after Step 6
        "vault_version": "0.1.0-mvp",
    }

    # Log the unlock event
    log_audit_event(
        "VAULT_UNLOCK",
        user_id,
        f"similarity={similarity_score:.4f} method=facial_recognition_v1",
    )

    return payload


def display_unlock_payload(payload: dict) -> None:
    """
    Display the vault unlock payload in a formatted, visually clear way.

    This is the "victory screen" of the facial recognition vault —
    the moment the user sees their decryption key has been released.

    Args:
        payload: The unlock payload dict from mock_unlock().
    """
    print("\n" + "=" * 70)
    print("  🔓  C H R O N O V A U L T  —  V A U L T  U N L O C K E D  🔓")
    print("=" * 70)
    print(f"  Status       : {payload['status']}")
    print(f"  User         : {payload['user_id']}")
    print(f"  Similarity   : {payload['similarity_score']:.4f}")
    print(f"  Method       : {payload['unlock_method']}")
    print(f"  Timestamp    : {payload['timestamp']}")
    print(f"  ZKML Ready   : {payload['zkml_ready']}")
    print(f"  Proof Hash   : {payload['proof_hash'] or 'N/A (MVP mode)'}")
    print("-" * 70)
    print(f"  🔑 AES-256 Decryption Key (Mock):")
    print(f"     {payload['mock_aes_key']}")
    print("=" * 70)
    print(
        "  ⚠️  In production, this key is released by the on-chain verifier"
    )
    print("     after ZK proof submission (Step 6).")
    print("=" * 70 + "\n")


def mock_deny(user_id: str, similarity_score: float, reason: str = "") -> dict:
    """
    Generate a vault denial payload when verification fails.

    Args:
        user_id: The user who attempted verification.
        similarity_score: The highest similarity score achieved.
        reason: Additional context for the denial.

    Returns:
        A structured denial payload dict.
    """
    payload = {
        "status": "VAULT_DENIED",
        "user_id": user_id,
        "similarity_score": round(similarity_score, 6),
        "reason": reason or "Face verification failed",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "unlock_method": "facial_recognition_v1",
    }

    log_audit_event(
        "VAULT_DENY",
        user_id,
        f"similarity={similarity_score:.4f} reason={reason}",
    )

    return payload


def display_deny_payload(payload: dict) -> None:
    """Display a formatted vault denial message."""
    print("\n" + "=" * 70)
    print("  🔒  C H R O N O V A U L T  —  A C C E S S  D E N I E D  🔒")
    print("=" * 70)
    print(f"  Status       : {payload['status']}")
    print(f"  User         : {payload['user_id']}")
    print(f"  Similarity   : {payload['similarity_score']:.4f}")
    print(f"  Reason       : {payload['reason']}")
    print(f"  Timestamp    : {payload['timestamp']}")
    print("=" * 70 + "\n")
