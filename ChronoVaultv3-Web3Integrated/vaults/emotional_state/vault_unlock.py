# ============================================================================
# ChronoVault - Emotional State Vault | Mock Vault Unlock
# ============================================================================
# Simulates the AES decryption key release that occurs when the emotional
# state vault conditions are met (Target Emotion + High Confidence).
# ============================================================================

import datetime
import secrets

from utils import log_audit_event


def mock_unlock(user_id: str, detected_emotion: str, confidence: float) -> dict:
    """
    Simulate an AES-256 decryption key release upon successful emotional state verification.

    Args:
        user_id: The user's identifier.
        detected_emotion: The specific emotion that triggered the unlock.
        confidence: The confidence score for the detected emotion.

    Returns:
        A structured unlock payload dict.
    """
    # Generate a mock AES-256 key (32 bytes = 256 bits)
    mock_key = secrets.token_hex(32)

    # Build the unlock payload
    payload = {
        "status": "VAULT_UNLOCKED",
        "user_id": user_id,
        "detected_emotion": detected_emotion,
        "similarity_score": round(confidence, 6), # Using similarity_score for schema consistency
        "mock_aes_key": mock_key,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "unlock_method": "emotional_state_v1",
        "zkml_ready": False,
        "proof_hash": None,
        "vault_version": "0.1.0-mvp",
    }

    # Log the unlock event
    log_audit_event(
        "VAULT_UNLOCK",
        user_id,
        f"emotion={detected_emotion} confidence={confidence:.4f}",
    )

    return payload


def display_unlock_payload(payload: dict) -> None:
    """Display the vault unlock payload in a formatted, visually clear way."""
    print("\n" + "=" * 70)
    print("  🔓  C H R O N O V A U L T  -  V A U L T  U N L O C K E D  🔓")
    print("=" * 70)
    print(f"  Status       : {payload['status']}")
    print(f"  User         : {payload['user_id']}")
    print(f"  Emotion      : {payload['detected_emotion'].title()}")
    print(f"  Confidence   : {payload['similarity_score']:.4f}")
    print(f"  Method       : {payload['unlock_method']}")
    print(f"  Timestamp    : {payload['timestamp']}")
    print(f"  ZKML Ready   : {payload['zkml_ready']}")
    print("-" * 70)
    print(f"  🔑 AES-256 Decryption Key (Mock):")
    print(f"     {payload['mock_aes_key']}")
    print("=" * 70)
    print("  ⚠️  In production, this key is released by the on-chain verifier")
    print("     after ZK proof submission (Step 6).")
    print("=" * 70 + "\n")


def mock_deny(user_id: str, detected_emotion: str, confidence: float, reason: str = "") -> dict:
    """
    Generate a vault denial payload when verification fails.
    """
    payload = {
        "status": "VAULT_DENIED",
        "user_id": user_id,
        "detected_emotion": detected_emotion,
        "similarity_score": round(confidence, 6),
        "reason": reason,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "unlock_method": "emotional_state_v1",
    }

    log_audit_event(
        "VAULT_DENY",
        user_id,
        f"emotion={detected_emotion} confidence={confidence:.4f} reason='{reason}'",
    )

    return payload


def display_deny_payload(payload: dict) -> None:
    """Display a formatted vault denial message."""
    print("\n" + "=" * 70)
    print("  [SECURE]  C H R O N O V A U L T  -  A C C E S S  D E N I E D  [SECURE]")
    print("=" * 70)
    print(f"  Status       : {payload['status']}")
    print(f"  User         : {payload['user_id']}")
    print(f"  Emotion      : {payload['detected_emotion'].title()}")
    print(f"  Confidence   : {payload['similarity_score']:.4f}")
    print(f"  Reason       : {payload['reason']}")
    print(f"  Timestamp    : {payload['timestamp']}")
    print("=" * 70 + "\n")
