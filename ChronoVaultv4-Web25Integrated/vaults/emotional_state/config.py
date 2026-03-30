# ============================================================================
# ChronoVault — Emotional State Vault | Configuration
# ============================================================================
# Central configuration for the Emotional State Vault (Step 4).
#
# This vault gates AES-256 decryption key release on the user's detected
# emotional state. A pre-trained RoBERTa model (fine-tuned on the
# GoEmotions dataset — 58K Reddit comments, 27 emotion labels + neutral)
# classifies text input and triggers unlock only when the target emotion
# is detected with sufficient confidence.
#
# All security-critical parameters are defined here for easy auditing.
# ============================================================================

import os
import torch

# ============================================================================
# PATHS
# ============================================================================

# Base directory of this vault module
VAULT_DIR = os.path.dirname(os.path.abspath(__file__))

# Local data directory for audit logs
DATA_DIR = os.path.join(VAULT_DIR, "data")

# Audit log path (append-only)
AUDIT_LOG_PATH = os.path.join(DATA_DIR, "audit.log")

# ============================================================================
# MODEL CONFIGURATION
# ============================================================================

# Hugging Face model identifier
# SamLowe/roberta-base-go_emotions:
#   - Base: RoBERTa (125M parameters)
#   - Fine-tuned on: Google GoEmotions dataset
#   - Labels: 28 emotion categories (27 emotions + neutral)
#   - Architecture: Multi-label sequence classification
#   - Size: ~500MB on first download, cached locally afterward
MODEL_NAME = "SamLowe/roberta-base-go_emotions"

# Maximum token length for the RoBERTa tokenizer
# RoBERTa supports up to 512 tokens; we cap at 256 for efficiency
# (most emotional text inputs are short phrases or sentences)
MAX_TOKEN_LENGTH = 256

# ============================================================================
# VAULT TRIGGER CONFIGURATION
# ============================================================================

# The specific emotion that unlocks the vault.
# Must match one of the 28 GoEmotions labels exactly:
#   admiration, amusement, anger, annoyance, approval, caring,
#   confusion, curiosity, desire, disappointment, disapproval,
#   disgust, embarrassment, excitement, fear, gratitude, grief,
#   joy, love, nervousness, optimism, pride, realization,
#   relief, remorse, sadness, surprise, neutral
#
# "joy" is chosen as default because:
#   1. It's a strong, unambiguous positive emotion
#   2. It's well-represented in the training data (reliable detection)
#   3. It requires genuine positive intent to trigger (hard to fake casually)
TARGET_EMOTION = "joy"

# Minimum confidence score (0.0 - 1.0) for the target emotion to trigger unlock.
# The GoEmotions model outputs softmax probabilities across all 28 labels.
#
# Threshold ranges:
#   > 0.90  = Very strict (requires extremely clear emotional expression)
#   > 0.85  = Strict (recommended for security-sensitive vaults)
#   > 0.70  = Moderate (allows more natural language variation)
#   > 0.50  = Lenient (high false acceptance risk)
CONFIDENCE_THRESHOLD = 0.85

# Number of top emotions to display in the analysis output
# Shows the user their full emotional profile for transparency
TOP_K_EMOTIONS = 5

# Maximum failed verification attempts before temporary lockout
MAX_VERIFICATION_ATTEMPTS = 5

# ============================================================================
# SUPPORTED EMOTIONS (GoEmotions Label Set)
# ============================================================================
# Complete list of the 28 emotions recognized by the model.
# This is used for validation and display purposes.

GOEMOTIONS_LABELS = [
    "admiration", "amusement", "anger", "annoyance", "approval",
    "caring", "confusion", "curiosity", "desire", "disappointment",
    "disapproval", "disgust", "embarrassment", "excitement", "fear",
    "gratitude", "grief", "joy", "love", "nervousness",
    "optimism", "pride", "realization", "relief", "remorse",
    "sadness", "surprise", "neutral",
]

# ============================================================================
# HARDWARE DETECTION
# ============================================================================


def get_device() -> torch.device:
    """
    Auto-detect the best available compute device.
    RoBERTa inference is efficient on CPU for single inputs,
    but GPU provides ~5x speedup for batch processing.
    """
    if torch.cuda.is_available():
        device = torch.device("cuda")
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[Config] GPU detected: {gpu_name}")
    else:
        device = torch.device("cpu")
        print("[Config] No GPU detected - running on CPU (sufficient for text inference)")
    return device
