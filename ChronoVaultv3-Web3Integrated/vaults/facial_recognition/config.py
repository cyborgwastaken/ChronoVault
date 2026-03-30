# ============================================================================
# ChronoVault - Facial Recognition Vault | Configuration
# ============================================================================
# Central configuration for the Facial Recognition Vault.
# All security-critical parameters are defined here for easy auditing.
# ============================================================================

import os
import torch

# ============================================================================
# PATHS
# ============================================================================

# Base directory of this vault module
VAULT_DIR = os.path.dirname(os.path.abspath(__file__))

# Local encrypted embedding storage - NEVER synced to any remote/chain
DATA_DIR = os.path.join(VAULT_DIR, "data")

# Audit log for unlock events (append-only)
AUDIT_LOG_PATH = os.path.join(DATA_DIR, "audit.log")

# ============================================================================
# NEURAL NETWORK PARAMETERS
# ============================================================================

# FaceNet model pre-trained weights source
# Options: 'vggface2' (recommended, trained on 3.3M images of 9K identities)
#          'casia-webface' (smaller dataset, faster but less accurate)
PRETRAINED_MODEL = "vggface2"

# Dimensionality of the face embedding vector output by InceptionResnetV1
EMBEDDING_DIM = 512

# MTCNN face crop size - FaceNet expects 160x160 aligned face images
IMAGE_SIZE = 160

# Minimum confidence score for MTCNN face detection (0.0 - 1.0)
# Higher = fewer false positives but may miss faces in poor lighting
MTCNN_CONFIDENCE_THRESHOLD = 0.90

# ============================================================================
# VERIFICATION PARAMETERS
# ============================================================================

# Cosine similarity threshold for face match.
# Typical ranges:
#   > 0.80  = Very strict (low FAR, higher FRR)
#   > 0.70  = Balanced (recommended for demos)
#   > 0.60  = Lenient (higher FAR, lower FRR)
# FAR = False Acceptance Rate, FRR = False Rejection Rate
SIMILARITY_THRESHOLD = 0.70

# Number of consecutive frames that must pass the threshold to trigger unlock.
# Prevents single-frame flukes from opening the vault.
CONSECUTIVE_FRAMES_REQUIRED = 3

# Maximum failed verification attempts before lockout
MAX_VERIFICATION_ATTEMPTS = 5

# Number of frames to capture and average during enrollment.
# Averaging reduces noise from single-frame capture.
ENROLLMENT_FRAMES = 5

# ============================================================================
# CRYPTOGRAPHIC PARAMETERS (Embedding Encryption at Rest)
# ============================================================================

# PBKDF2 iterations for deriving the embedding encryption key from user PIN.
# OWASP 2024 recommendation: ≥ 600,000 for HMAC-SHA256
PBKDF2_ITERATIONS = 600_000

# Salt length in bytes for PBKDF2 key derivation
PBKDF2_SALT_LENGTH = 32

# AES-GCM nonce length in bytes (standard: 12)
AES_GCM_NONCE_LENGTH = 12

# Derived key length in bytes (32 = AES-256)
DERIVED_KEY_LENGTH = 32

# ============================================================================
# HARDWARE DETECTION
# ============================================================================


def get_device() -> torch.device:
    """
    Auto-detect the best available compute device.
    Prioritizes CUDA GPU for faster inference, falls back to CPU.
    Consumer-grade NVIDIA GPUs (GTX 1060+) provide ~10x speedup.
    """
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[Config] [GPU] GPU detected: {gpu_name}")
        return torch.device("cuda")
    else:
        print("[Config] [CPU] No GPU detected -- running on CPU (still performant)")
        return torch.device("cpu")
