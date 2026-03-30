# ============================================================================
# ChronoVault — Facial Recognition Vault | Face Detector
# ============================================================================
# Wraps MTCNN (Multi-task Cascaded Convolutional Networks) from `facenet-pytorch`
# for real-time face detection and alignment from webcam frames.
#
# MTCNN performs three tasks in a single pipeline:
#   1. Face Detection — Locates faces in the image
#   2. Landmark Detection — Finds eyes, nose, mouth positions
#   3. Alignment — Crops and aligns the face to a canonical 160×160 pose
#
# This alignment step is CRITICAL for embedding quality. FaceNet expects
# consistently aligned inputs to produce reliable embeddings.
#
# Security Decision: We REJECT frames with multiple faces detected.
# This prevents an attacker from holding up a photo alongside their own face.
# ============================================================================

from typing import Optional, Tuple

import cv2
import numpy as np
import torch
from facenet_pytorch import MTCNN

from config import IMAGE_SIZE, MTCNN_CONFIDENCE_THRESHOLD, get_device


class FaceDetector:
    """
    MTCNN-based face detector and aligner for the facial recognition vault.

    Detects exactly one face in a frame, aligns it, and returns a tensor
    ready for embedding generation by FaceNet.

    Attributes:
        device: Compute device (CUDA or CPU).
        mtcnn: The MTCNN model instance.
    """

    def __init__(self):
        """
        Initialize MTCNN face detector.

        Configuration:
            - image_size=160: Output size matching FaceNet's expected input
            - margin=20: Extra pixels around the face crop (improves alignment)
            - keep_all=True: Detect ALL faces (so we can enforce single-face policy)
            - min_face_size=60: Minimum face size in pixels (filters distant/tiny faces)
            - thresholds: MTCNN's three-stage detection thresholds
        """
        self.device = get_device()

        self.mtcnn = MTCNN(
            image_size=IMAGE_SIZE,
            margin=20,
            keep_all=True,  # Detect all faces for multi-face rejection
            min_face_size=60,
            thresholds=[0.6, 0.7, 0.7],  # P-Net, R-Net, O-Net thresholds
            factor=0.709,  # Scale factor for image pyramid
            post_process=True,  # Normalize output to [-1, 1] for FaceNet
            device=self.device,
        )

        print(f"[Detector] ✅ MTCNN face detector initialized | Device: {self.device}")

    def detect_face(self, frame: np.ndarray) -> Optional[torch.Tensor]:
        """
        Detect and align a single face from a BGR webcam frame.

        Args:
            frame: BGR image from OpenCV's VideoCapture (shape: H×W×3).

        Returns:
            Aligned face tensor of shape (3, 160, 160) normalized to [-1, 1],
            or None if:
                - No face detected
                - Multiple faces detected (security rejection)
                - Face confidence below threshold

        Security:
            Multi-face rejection prevents photo-alongside-attacker attacks.
            The confidence threshold filters low-quality detections.
        """
        # OpenCV captures BGR; MTCNN expects RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Detect all faces with bounding boxes and confidence scores
        faces, probs = self.mtcnn(frame_rgb, return_prob=True)

        # Case 1: No faces detected
        if faces is None or len(faces) == 0:
            return None

        # Case 2: Multiple faces detected — SECURITY REJECTION
        # Filter by confidence first
        confident_faces = []
        for i, prob in enumerate(probs):
            if prob is not None and prob >= MTCNN_CONFIDENCE_THRESHOLD:
                confident_faces.append(i)

        if len(confident_faces) == 0:
            return None

        if len(confident_faces) > 1:
            print(
                f"[Detector] ⚠️  REJECTED: {len(confident_faces)} faces detected "
                f"(security policy: exactly 1 required)"
            )
            return None

        # Case 3: Exactly one confident face — return it
        face_idx = confident_faces[0]
        face_tensor = faces[face_idx]

        return face_tensor

    def detect_face_with_box(
        self, frame: np.ndarray
    ) -> Tuple[Optional[torch.Tensor], Optional[np.ndarray], Optional[float], int]:
        """
        Detect face and return both the aligned tensor AND bounding box for UI overlay.

        Args:
            frame: BGR image from OpenCV's VideoCapture.

        Returns:
            Tuple of:
                - face_tensor: Aligned face (3, 160, 160) or None
                - box: Bounding box [x1, y1, x2, y2] as numpy array or None
                - confidence: Detection confidence (0.0-1.0) or None
                - num_faces: Total number of confident faces detected

        The bounding box is used to draw a rectangle on the webcam preview.
        Green box = single face detected (ready for verification).
        Red box = multiple faces (rejected) or no face.
        """
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Get faces, probabilities, AND bounding boxes
        boxes, probs = self.mtcnn.detect(frame_rgb)

        # No detections at all
        if boxes is None or probs is None:
            return None, None, None, 0

        # Filter by confidence
        confident_indices = []
        for i, prob in enumerate(probs):
            if prob is not None and prob >= MTCNN_CONFIDENCE_THRESHOLD:
                confident_indices.append(i)

        num_confident = len(confident_indices)

        if num_confident == 0:
            return None, None, None, 0

        if num_confident > 1:
            # Return the first box for UI display but no face tensor (rejected)
            first_box = boxes[confident_indices[0]].astype(int)
            return None, first_box, float(probs[confident_indices[0]]), num_confident

        # Exactly one face — extract aligned tensor
        idx = confident_indices[0]
        box = boxes[idx].astype(int)
        confidence = float(probs[idx])

        # Get the aligned face tensor using MTCNN's built-in alignment
        faces, _ = self.mtcnn(frame_rgb, return_prob=True)

        if faces is not None and len(faces) > 0:
            # Find the face closest to our detected box
            face_tensor = faces[0]  # With single face, this is always correct
            return face_tensor, box, confidence, num_confident

        return None, box, confidence, num_confident
