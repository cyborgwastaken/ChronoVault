# ============================================================================
# ChronoVault - Emotional State Vault | Verification Script
# ============================================================================
# Interactive CLI tool for verifying emotional state to unlock the vault.
# ============================================================================

import argparse
import sys

from config import CONFIDENCE_THRESHOLD, MAX_VERIFICATION_ATTEMPTS, TARGET_EMOTION
from model import EmotionClassifier
from utils import log_audit_event
from vault_unlock import (
    display_deny_payload,
    display_unlock_payload,
    mock_deny,
    mock_unlock,
)


def run_verification(user_id: str, max_attempts: int = MAX_VERIFICATION_ATTEMPTS):
    """
    Execute the emotional state verification pipeline.
    
    Args:
        user_id: Specific user identifier.
        max_attempts: Number of allowed retries before lockout.
    """
    print("\n" + "=" * 60)
    print("  CHRONOVAULT - EMOTIONAL STATE VAULT | VERIFICATION")
    print("=" * 60)
    print(f"  User ID         : {user_id}")
    print(f"  Target Emotion  : {TARGET_EMOTION.title()}")
    print(f"  Threshold       : {CONFIDENCE_THRESHOLD}")
    print(f"  Max Attempts    : {max_attempts}")
    print("=" * 60 + "\n")

    # Initialize the NLP classifier (loads into memory)
    classifier = EmotionClassifier()
    print("\n[Verify] [OK] Classifier ready. Enter text to analyze.")

    attempts = 0

    while attempts < max_attempts:
        print("\n" + "-" * 60)
        # Main prompt
        print("🗣️  Enter your passphrase or speak your current thoughts to unlock the vault:")
        print("   (Type 'quit' or 'exit' to abort)")
        text_input = input("\n> ")

        if text_input.strip().lower() in ["quit", "exit"]:
            print("\n[Verify] Verification aborted by user.")
            break

        if not text_input.strip():
            print("\n[Verify] ⚠️  Empty input. Please provide a substantive sentence.")
            continue

        attempts += 1
        
        print("\n[Verify] [NLP] Analyzing text...")
        # We explicitly check for the target emotion mapped in the configuration
        is_match, detected_emotion, target_score, top_k = classifier.check_target_emotion(
            text_input, TARGET_EMOTION, CONFIDENCE_THRESHOLD
        )
        
        # We also want the absolute top emotion for UI display
        overall_top_emotion, overall_top_score, _ = classifier.analyze_emotion(text_input)

        print("\n  Top Detected Emotions:")
        for idx, entry in enumerate(top_k):
            print(f"    {idx+1}. {entry['label'].title()}: {entry['score']:.4f}")

        if is_match:
            print(f"\n[Verify] [OK] SUCCESS: Required emotion '{TARGET_EMOTION}' detected with confidence {target_score:.4f}.")
            # Trigger Vault Unlock
            payload = mock_unlock(user_id, TARGET_EMOTION, target_score)
            display_unlock_payload(payload)
            return

        else:
            print(f"\n[Verify] [FAIL] MISMATCH: Required emotion '{TARGET_EMOTION}' not reached (Score: {target_score:.4f} < {CONFIDENCE_THRESHOLD}).")
            print(f"           Primary detected emotion was: {overall_top_emotion.title()} ({overall_top_score:.4f})")
            print(f"           Attempts remaining: {max_attempts - attempts}")
            
            # Log failure
            log_audit_event(
                "VERIFY_FAIL", user_id, 
                f"target={TARGET_EMOTION} target_score={target_score:.4f} top_emotion={overall_top_emotion}"
            )

    # Lockout after max attempts
    if attempts >= max_attempts:
        print(f"\n[Verify] [SECURE] LOCKOUT: Max attempts ({max_attempts}) exceeded.")
        payload = mock_deny(user_id, TARGET_EMOTION, 0.0, "Max attempts exceeded")
        display_deny_payload(payload)


# ============================================================================
# CLI Entry Point
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ChronoVault - Emotional State Vault Verification MVP",
    )
    parser.add_argument(
        "--user-id",
        required=True,
        help="Unique identifier for the user (e.g., 'alice')",
    )

    args = parser.parse_args()
    
    try:
        run_verification(args.user_id)
    except KeyboardInterrupt:
        print("\n[Verify] Process interrupted by user.")
        sys.exit(0)
