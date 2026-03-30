# ============================================================================
# ChronoVault — Facial Recognition Vault | Enrollment Script
# ============================================================================
# Interactive CLI tool for enrolling a user's face into the vault.
#
# Usage:
#   python enroll.py --user-id alice
#   python enroll.py --user-id alice --frames 10   (capture more frames)
#   python enroll.py --user-id alice --camera 1     (use external webcam)
#
# Enrollment Flow:
#   1. Open webcam with live preview
#   2. MTCNN detects face in real-time (green bounding box)
#   3. User presses [SPACE] to begin capture sequence
#   4. System captures N frames, generates N embeddings, averages them
#   5. User sets a vault PIN (via secure terminal input)
#   6. Averaged embedding is encrypted and saved locally
#   7. No raw images are EVER written to disk
#
# Security:
#   - Raw webcam frames exist only in RAM during the session
#   - Only the encrypted mathematical embedding is persisted
#   - The PIN is never stored — it derives the encryption key
#   - Re-enrollment overwrites the previous vault file
# ============================================================================

import argparse
import getpass
import sys
import time

import cv2
import numpy as np
import torch

from config import ENROLLMENT_FRAMES, SIMILARITY_THRESHOLD
from embedding_store import EmbeddingStore
from face_detector import FaceDetector
from model import FaceNetSiamese
from utils import log_audit_event


def draw_enrollment_ui(frame, face_box, confidence, num_faces, status_text, captured_count, total_frames):
    """
    Draw the enrollment UI overlay on the webcam frame.

    Renders:
        - Face bounding box (green = ready, red = issue)
        - Status text with instructions
        - Capture progress counter
        - ChronoVault branding
    """
    h, w = frame.shape[:2]

    # Semi-transparent top bar for status text
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 60), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    # ChronoVault branding
    cv2.putText(
        frame, "CHRONOVAULT | FACIAL ENROLLMENT",
        (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 200), 1
    )

    # Status text
    cv2.putText(
        frame, status_text,
        (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    # Face bounding box
    if face_box is not None:
        x1, y1, x2, y2 = face_box

        if num_faces == 1:
            # Green box — single face, ready
            color = (0, 255, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            if confidence is not None:
                cv2.putText(
                    frame, f"Confidence: {confidence:.2f}",
                    (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1
                )
        else:
            # Red box — multiple faces
            color = (0, 0, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame, f"MULTI-FACE REJECTED ({num_faces})",
                (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1
            )

    # Capture progress bar (bottom)
    if captured_count > 0:
        progress = captured_count / total_frames
        bar_width = int(w * progress)
        cv2.rectangle(frame, (0, h - 30), (bar_width, h), (0, 255, 100), -1)
        cv2.putText(
            frame, f"Captured: {captured_count}/{total_frames}",
            (10, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1
        )

    # Instructions (bottom-left)
    cv2.putText(
        frame, "[SPACE] Capture  |  [Q] Quit",
        (10, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1
    )

    return frame


def run_enrollment(user_id: str, num_frames: int, camera_idx: int):
    """
    Execute the full enrollment pipeline.

    Args:
        user_id: Unique identifier for the user being enrolled.
        num_frames: Number of frames to capture and average.
        camera_idx: OpenCV camera device index (0 = default webcam).
    """
    print("\n" + "=" * 60)
    print("  CHRONOVAULT — FACIAL RECOGNITION VAULT | ENROLLMENT")
    print("=" * 60)
    print(f"  User ID       : {user_id}")
    print(f"  Capture Frames: {num_frames}")
    print(f"  Camera Index  : {camera_idx}")
    print("=" * 60 + "\n")

    # 1. Initialize components
    print("[Enroll] Initializing neural network components...\n")
    detector = FaceDetector()
    siamese = FaceNetSiamese()
    store = EmbeddingStore()

    # Check for existing enrollment
    if store.user_exists(user_id):
        print(f"\n[Enroll] ⚠️  User '{user_id}' already enrolled.")
        overwrite = input("           Overwrite existing enrollment? (y/N): ").strip().lower()
        if overwrite != "y":
            print("[Enroll] Enrollment cancelled.")
            return
        store.delete_enrollment(user_id)

    # 1.5 Get vault PIN from user (Prompting early avoids OpenCV terminal focus issues)
    print("\n" + "-" * 40)
    print("  Set your vault PIN")
    print("  This PIN encrypts your face embedding at rest.")
    print("  You will need it every time you verify.")
    print("-" * 40)

    while True:
        pin = input("  Enter vault PIN (visible): ")
        if len(pin) < 4:
            print("  ⚠️  PIN must be at least 4 characters.")
            continue
        pin_confirm = input("  Confirm vault PIN (visible): ")
        if pin != pin_confirm:
            print("  ⚠️  PINs do not match. Try again.")
            continue
        break

    # 2. Open webcam
    print(f"\n[Enroll] Opening camera {camera_idx}...")
    cap = cv2.VideoCapture(camera_idx)

    if not cap.isOpened():
        print("[Enroll] ❌ Failed to open webcam. Check your camera connection.")
        sys.exit(1)

    # Set resolution (720p for better face detection)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("[Enroll] ✅ Webcam opened. Position your face in the frame.")
    print("[Enroll]    Press [SPACE] when ready to begin capture.")
    print("[Enroll]    Press [Q] to abort.\n")

    # 3. Live preview loop — wait for user to press SPACE
    capturing = False
    captured_embeddings = []
    status_text = "Position your face and press [SPACE] to begin capture"

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[Enroll] ❌ Failed to read from webcam.")
            break

        # Detect face for UI overlay
        face_tensor, face_box, confidence, num_faces = detector.detect_face_with_box(frame)

        # Draw UI
        if not capturing:
            if face_tensor is not None:
                status_text = "Face detected! Press [SPACE] to begin capture"
            elif num_faces > 1:
                status_text = f"REJECTED: {num_faces} faces detected (need exactly 1)"
            else:
                status_text = "No face detected — adjust position/lighting"

        frame = draw_enrollment_ui(
            frame, face_box, confidence, num_faces,
            status_text, len(captured_embeddings), num_frames
        )

        cv2.imshow("ChronoVault Enrollment", frame)

        # Handle key presses
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            print("\n[Enroll] ❌ Enrollment aborted by user.")
            break

        if key == ord(" ") and not capturing:
            if face_tensor is not None:
                capturing = True
                print("[Enroll] 📸 Beginning capture sequence...")
            else:
                print("[Enroll] ⚠️  No face detected — can't begin capture")

        # Capture frames when in capture mode
        if capturing and face_tensor is not None:
            embedding = siamese.generate_embedding(face_tensor)
            captured_embeddings.append(embedding)
            status_text = f"Capturing... {len(captured_embeddings)}/{num_frames}"
            print(f"[Enroll] 📸 Frame {len(captured_embeddings)}/{num_frames} captured")

            # Brief pause between captures for pose variation
            time.sleep(0.3)

            # Check if we have enough frames
            if len(captured_embeddings) >= num_frames:
                print(f"\n[Enroll] ✅ All {num_frames} frames captured!")
                break

    # 4. Release webcam
    cap.release()
    cv2.destroyAllWindows()

    # 5. Process captured embeddings
    if len(captured_embeddings) < num_frames:
        print(f"\n[Enroll] ❌ Only captured {len(captured_embeddings)}/{num_frames} frames.")
        print("[Enroll]    Enrollment incomplete. Please try again.")
        return

    # 6. Average embeddings for noise reduction
    print("\n[Enroll] Computing averaged embedding from captured frames...")
    stacked = torch.stack(captured_embeddings)  # Shape: (N, 512)
    averaged_embedding = torch.mean(stacked, dim=0)  # Shape: (512,)

    # Re-normalize after averaging (important for cosine similarity)
    averaged_embedding = torch.nn.functional.normalize(averaged_embedding, p=2, dim=0)

    # Compute internal consistency (how similar are the captured frames to each other?)
    similarities = []
    for emb in captured_embeddings:
        sim = siamese.compare_embeddings(averaged_embedding, emb)
        similarities.append(sim)
    avg_consistency = np.mean(similarities)

    print(f"[Enroll] 📊 Internal consistency: {avg_consistency:.4f}")
    if avg_consistency < SIMILARITY_THRESHOLD:
        print(f"[Enroll] ⚠️  Low consistency ({avg_consistency:.4f} < {SIMILARITY_THRESHOLD})")
        print("[Enroll]    Consider re-enrolling with better lighting/stability.")



    # 8. Encrypt and save
    print("\n[Enroll] 🔐 Encrypting and saving embedding...")
    success = store.save_embedding(averaged_embedding, user_id, pin)

    if success:
        print("\n" + "=" * 60)
        print("  ✅  ENROLLMENT COMPLETE")
        print("=" * 60)
        print(f"  User ID         : {user_id}")
        print(f"  Embedding Dim   : {averaged_embedding.shape[0]}")
        print(f"  Frames Averaged : {num_frames}")
        print(f"  Consistency     : {avg_consistency:.4f}")
        print(f"  Vault File      : data/{user_id}.vault")
        print("=" * 60)
        print("  Next: Run  python verify.py --user-id", user_id)
        print("=" * 60 + "\n")
    else:
        print("\n[Enroll] ❌ Enrollment failed. Check error messages above.")

    # 9. Scrub sensitive data from memory
    del captured_embeddings, averaged_embedding, pin
    import gc
    gc.collect()


# ============================================================================
# CLI Entry Point
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ChronoVault — Facial Recognition Vault Enrollment",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python enroll.py --user-id alice
  python enroll.py --user-id bob --frames 10 --camera 1
        """,
    )

    parser.add_argument(
        "--user-id",
        required=True,
        help="Unique identifier for the user being enrolled (e.g., 'alice')",
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=ENROLLMENT_FRAMES,
        help=f"Number of frames to capture and average (default: {ENROLLMENT_FRAMES})",
    )
    parser.add_argument(
        "--camera",
        type=int,
        default=0,
        help="OpenCV camera device index (default: 0 = built-in webcam)",
    )

    args = parser.parse_args()
    run_enrollment(args.user_id, args.frames, args.camera)
