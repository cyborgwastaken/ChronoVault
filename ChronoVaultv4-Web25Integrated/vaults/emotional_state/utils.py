# ============================================================================
# ChronoVault — Emotional State Vault | Shared Utilities
# ============================================================================
# Logging and helper functions shared across the emotional state vault.
# Crypto utilities are lighter here than Step 3 (no embedding encryption
# needed — text input is ephemeral and never stored).
# ============================================================================

import datetime
import gc
import os


def log_audit_event(event_type: str, user_id: str, details: str = "") -> None:
    """
    Append an audit event to the local audit log.

    Tracks all verification attempts, unlocks, and lockouts for
    security review. The audit log is append-only and gitignored.

    Args:
        event_type: Event category
            - VERIFY_SUCCESS: Emotion matched, vault unlocked
            - VERIFY_FAIL: Emotion did not match or below threshold
            - LOCKOUT: Max attempts exceeded
        user_id: The vault user identifier
        details: Additional context (detected emotion, score, etc.)
    """
    from config import AUDIT_LOG_PATH

    timestamp = datetime.datetime.now().isoformat()
    log_line = f"[{timestamp}] [{event_type}] user={user_id} {details}\n"

    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)

    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(log_line)


def secure_delete(obj) -> None:
    """
    Best-effort memory cleanup for sensitive objects.
    Deletes the reference and forces garbage collection.
    """
    del obj
    gc.collect()
