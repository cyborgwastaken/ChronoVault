# ============================================================================
# ChronoVault — Facial Recognition Vault | Verification Script
# ============================================================================
# Real-time face verification against an enrolled identity.
# Upon successful match, triggers the mock vault unlock (AES key release).
#
# Usage:
#   python verify.py --user-id alice
#   python verify.py --user-id alice --threshold 0.75  (stricter matching)
#   python verify.py --user-id alice --camera 1        (external webcam)
#
# Verification Flow:
#   1. User enters vault PIN → decrypts stored reference embedding
#   2. Webcam opens with real-time face detection overlay
#   3. Each frame: detect face → generate embedding → compare to reference
#   4. If similarity ≥ threshold for N consecutive frames → VAULT UNLOCKED
#   5. On unlock: display mock AES-256 decryption key
#   6. After MAX_ATTEMPTS failures → lockout
#
# Security:
#   - Reference embedding only exists in RAM after PIN decryption
#   - Failed attempts are logged to the audit trail
#   - Consecutive-frame requirement prevents single-frame spoofing
#   - Multi-face frames are rejected (anti-photo-attack measure)
# ============================================================================

import argparse
import getpass
import sys
import time

import cv2
import numpy as np

from config import (
    CONSECUTIVE_FRAMES_REQUIRED,
    MAX_VERIFICATION_ATTEMPTS,
    SIMILARITY_THRESHOLD,
)
from embedding_store import EmbeddingStore
from face_detector import FaceDetector
from model import FaceNetSiamese
from utils import log_audit_event, secure_delete
from vault_unlock import (
    display_deny_payload,
    display_unlock_payload,
    mock_deny,
    mock_unlock,
)


def draw_verification_ui(
    frame, face_box, confidence, num_faces,
    similarity, threshold, consecutive_matches,
    required_consecutive, status, attempts_left
):
    """
    Draw the real-time verification UI overlay on the webcam frame.

    Renders:
        - Face bounding box (green = match, yellow = detecting, red = mismatch)
        - Similarity score with visual bar
        - Consecutive match counter
        - Attempt counter
        - ChronoVault branding
    """
    h, w = frame.shape[:2]

    # --- Top bar ---
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 80), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    # Branding
    cv2.putText(
        frame, "CHRONOVAULT | FACIAL VERIFICATION",
        (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 200), 1
    )

    # Status text
    status_color = (200, 200, 200)
    if status == "MATCH":
        status_color = (0, 255, 0)
    elif status == "MISMATCH":
        status_color = (0, 100, 255)
    elif status == "UNLOCKED":
        status_color = (0, 255, 255)

    cv2.putText(
        frame, f"Status: {status}",
        (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 1
    )

    # Attempts remaining
    cv2.putText(
        frame, f"Attempts: {attempts_left}",
        (w - 150, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    # --- Similarity bar ---
    if similarity is not None:
        # Similarity score text
        sim_text = f"Similarity: {similarity:.4f} / {threshold:.2f}"
        cv2.putText(
            frame, sim_text,
            (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1
        )

        # Visual progress bar
        bar_x, bar_y = w - 220, 40
        bar_w, bar_h = 200, 20

        # Background
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (50, 50, 50), -1)

        # Threshold marker
        thresh_x = bar_x + int(bar_w * threshold)
        cv2.line(frame, (thresh_x, bar_y), (thresh_x, bar_y + bar_h), (0, 255, 255), 2)

        # Similarity fill
        fill_w = int(bar_w * min(similarity, 1.0))
        fill_color = (0, 255, 0) if similarity >= threshold else (0, 100, 255)
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h), fill_color, -1)

        # Border
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (200, 200, 200), 1)

    # --- Face bounding box ---
    if face_box is not None:
        x1, y1, x2, y2 = face_box

        if num_faces > 1:
            color = (0, 0, 255)  # Red — multi-face rejection
            label = f"REJECTED: {num_faces} faces"
        elif similarity is not None and similarity >= threshold:
            color = (0, 255, 0)  # Green — match
            label = f"MATCH ({similarity:.3f})"
        elif similarity is not None:
            color = (0, 100, 255)  # Orange — mismatch
            label = f"MISMATCH ({similarity:.3f})"
        else:
            color = (255, 255, 0)  # Yellow — detecting
            label = "Detecting..."

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            frame, label,
            (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1
        )

    # --- Consecutive match counter (bottom) ---
    bar_y_bottom = h - 50
    cv2.putText(
        frame, f"Consecutive Matches: {consecutive_matches}/{required_consecutive}",
        (10, bar_y_bottom), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1
    )

    # Consecutive match progress dots
    for i in range(required_consecutive):
        cx = 300 + i * 25
        cy = bar_y_bottom - 5
        dot_color = (0, 255, 0) if i < consecutive_matches else (80, 80, 80)
        cv2.circle(frame, (cx, cy), 8, dot_color, -1)

    # Instructions
    cv2.putText(
        frame, "[Q] Quit",
        (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1
    )

    return frame


def run_verification(user_id: str, threshold: float, camera_idx: int):
    """
    Execute the full facial verification pipeline.

    Args:
        user_id: The enrolled user to verify against.
        threshold: Cosine similarity threshold for a positive match.
        camera_idx: OpenCV camera device index.
    """
    print("\n" + "=" * 60)
    print("  CHRONOVAULT — FACIAL RECOGNITION VAULT | VERIFICATION")
    print("=" * 60)
    print(f"  User ID         : {user_id}")
    print(f"  Threshold       : {threshold}")
    print(f"  Consecutive Req : {CONSECUTIVE_FRAMES_REQUIRED}")
    print(f"  Max Attempts    : {MAX_VERIFICATION_ATTEMPTS}")
    print(f"  Camera Index    : {camera_idx}")
    print("=" * 60 + "\n")

    # 1. Initialize components
    print("[Verify] Initializing neural network components...\n")
    detector = FaceDetector()
    siamese = FaceNetSiamese()
    store = EmbeddingStore()

    # 2. Check enrollment exists
    if not store.user_exists(user_id):
        print(f"[Verify] ❌ No enrollment found for user '{user_id}'.")
        print(f"[Verify]    Run: python enroll.py --user-id {user_id}")
        sys.exit(1)

    # 3. Get vault PIN and decrypt reference embedding
    print("-" * 40)
    print("  Enter your vault PIN to decrypt")
    print("  the stored face embedding.")
    print("-" * 40)

    pin = input("  Vault PIN (visible): ")

    print("\n[Verify] 🔐 Decrypting stored embedding...")
    reference_embedding = store.load_embedding(user_id, pin)

    if reference_embedding is None:
        print("[Verify] ❌ Failed to decrypt embedding. Wrong PIN or corrupted vault.")
        log_audit_event("VERIFY_FAIL", user_id, "reason=pin_decrypt_failed")
        sys.exit(1)

    print(f"[Verify] ✅ Reference embedding loaded (shape: {reference_embedding.shape})")

    # 4. Open webcam
    print(f"\n[Verify] Opening camera {camera_idx}...")
    cap = cv2.VideoCapture(camera_idx)

    if not cap.isOpened():
        print("[Verify] ❌ Failed to open webcam.")
        secure_delete(reference_embedding)
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("[Verify] ✅ Webcam opened. Look at the camera for verification.\n")

    # 5. Verification loop
    consecutive_matches = 0
    attempts = 0
    max_similarity_seen = 0.0
    unlocked = False
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[Verify] ❌ Failed to read from webcam.")
            break

        frame_count += 1
        similarity = None
        status = "DETECTING"

        # Detect face (with bounding box for UI)
        face_tensor, face_box, confidence, num_faces = detector.detect_face_with_box(frame)

        if face_tensor is not None and num_faces == 1:
            # Generate live embedding
            live_embedding = siamese.generate_embedding(face_tensor)

            # Compare against reference
            is_match, similarity = siamese.verify(
                reference_embedding, live_embedding, threshold
            )

            max_similarity_seen = max(max_similarity_seen, similarity)

            if is_match:
                consecutive_matches += 1
                status = "MATCH"

                # Check if we've hit the consecutive threshold
                if consecutive_matches >= CONSECUTIVE_FRAMES_REQUIRED:
                    status = "UNLOCKED"
                    unlocked = True

                    # Draw final frame with UNLOCKED status
                    frame = draw_verification_ui(
                        frame, face_box, confidence, num_faces,
                        similarity, threshold, consecutive_matches,
                        CONSECUTIVE_FRAMES_REQUIRED, status,
                        MAX_VERIFICATION_ATTEMPTS - attempts
                    )
                    cv2.imshow("ChronoVault Verification", frame)
                    cv2.waitKey(1000)  # Show UNLOCKED state for 1 second
                    break
            else:
                # Reset consecutive counter on mismatch
                if consecutive_matches > 0:
                    consecutive_matches = 0
                    attempts += 1
                    log_audit_event(
                        "VERIFY_ATTEMPT", user_id,
                        f"attempt={attempts} similarity={similarity:.4f}"
                    )
                status = "MISMATCH"

        elif num_faces > 1:
            consecutive_matches = 0
            status = "MULTI-FACE REJECTED"
        else:
            status = "NO FACE"

        # Check lockout
        if attempts >= MAX_VERIFICATION_ATTEMPTS:
            print(f"\n[Verify] 🔒 LOCKOUT: Max attempts ({MAX_VERIFICATION_ATTEMPTS}) exceeded.")
            log_audit_event("LOCKOUT", user_id, f"max_similarity={max_similarity_seen:.4f}")
            break

        # Draw UI overlay
        frame = draw_verification_ui(
            frame, face_box, confidence, num_faces,
            similarity, threshold, consecutive_matches,
            CONSECUTIVE_FRAMES_REQUIRED, status,
            MAX_VERIFICATION_ATTEMPTS - attempts
        )

        cv2.imshow("ChronoVault Verification", frame)

        # Key handling
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            print("\n[Verify] Verification cancelled by user.")
            break

    # 6. Cleanup webcam
    cap.release()
    cv2.destroyAllWindows()

    # 7. Process result
    if unlocked:
        # VAULT UNLOCKED — trigger mock key release
        payload = mock_unlock(user_id, max_similarity_seen)
        display_unlock_payload(payload)
    elif attempts >= MAX_VERIFICATION_ATTEMPTS:
        # LOCKOUT
        payload = mock_deny(user_id, max_similarity_seen, "Max attempts exceeded")
        display_deny_payload(payload)
    else:
        # User quit manually
        payload = mock_deny(user_id, max_similarity_seen, "Verification cancelled by user")
        display_deny_payload(payload)

    # 8. Scrub reference embedding from memory
    secure_delete(reference_embedding)
    print("[Verify] 🧹 Reference embedding scrubbed from memory.")


# ============================================================================
# CLI Entry Point
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ChronoVault — Facial Recognition Vault Verification",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python verify.py --user-id alice
  python verify.py --user-id alice --threshold 0.75
  python verify.py --user-id alice --camera 1
        """,
    )

    parser.add_argument(
        "--user-id",
        required=True,
        help="The enrolled user to verify against",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=SIMILARITY_THRESHOLD,
        help=f"Cosine similarity threshold (default: {SIMILARITY_THRESHOLD})",
    )
    parser.add_argument(
        "--camera",
        type=int,
        default=0,
        help="OpenCV camera device index (default: 0)",
    )

    args = parser.parse_args()
    run_verification(args.user_id, args.threshold, args.camera)
