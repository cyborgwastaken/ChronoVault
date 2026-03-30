# ============================================================================
# ChronoVault — Emotional State Vault | RoBERTa Emotion Classifier
# ============================================================================
# Wraps the SamLowe/roberta-base-go_emotions model from Hugging Face.
#
# Architecture Overview:
#   - Base Model: RoBERTa (Robustly Optimized BERT Approach)
#       - 125M parameters, 12 transformer layers, 768 hidden dim
#       - Pre-trained on 160GB of English text (masked language modeling)
#   - Fine-tuning: GoEmotions dataset (Google Research)
#       - 58K Reddit comments labeled with 27 emotions + neutral
#       - Multi-label classification head (sigmoid per label)
#   - Output: Probability distribution across 28 emotion categories
#
# Why RoBERTa for Vault Gating:
#   - Understands nuanced emotional expression in natural language
#   - Captures context, irony, and compound emotions
#   - Lightweight enough for real-time CPU inference (~50ms per input)
#   - Multi-label output lets us analyze the full emotional spectrum
#
# The model is downloaded once (~500MB) from Hugging Face Hub and cached
# locally at ~/.cache/huggingface/hub/ for all subsequent runs.
# ============================================================================

from typing import Dict, List, Tuple

import torch
import torch.nn.functional as F
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from config import (
    GOEMOTIONS_LABELS,
    MAX_TOKEN_LENGTH,
    MODEL_NAME,
    TOP_K_EMOTIONS,
    get_device,
)


class EmotionClassifier:
    """
    RoBERTa-based emotion classifier for vault gating.

    Loads the SamLowe/roberta-base-go_emotions model and provides
    methods to analyze text input and return emotion predictions
    with confidence scores.

    Attributes:
        device: Compute device (CUDA or CPU).
        tokenizer: RoBERTa tokenizer (byte-pair encoding).
        model: Fine-tuned RoBERTa sequence classification model.
        labels: List of 28 GoEmotions label strings.
    """

    def __init__(self):
        """
        Initialize the emotion classifier.

        Downloads the model and tokenizer on first run (~500MB).
        Subsequent runs load from the local Hugging Face cache.
        """
        print("[Model] Loading RoBERTa Emotion Classifier...")
        print(f"[Model] Model: {MODEL_NAME}")

        # 1. Detect hardware
        self.device = get_device()

        # 2. Load tokenizer (converts text to token IDs)
        #    RoBERTa uses byte-pair encoding (BPE) with a 50K vocabulary
        print("[Model] Loading tokenizer...")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

        # 3. Load the fine-tuned classification model
        #    This includes the RoBERTa base + a linear classification head
        #    that outputs logits for each of the 28 emotion labels
        print("[Model] Loading model weights (this may take a moment on first run)...")
        self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        self.model.to(self.device)
        self.model.eval()  # Set to inference mode (disables dropout)

        # 4. Store label mapping
        self.labels = GOEMOTIONS_LABELS

        print(f"[Model] Loaded successfully | Device: {self.device}")
        print(f"[Model] Labels: {len(self.labels)} emotion categories")
        print(f"[Model] Max tokens: {MAX_TOKEN_LENGTH}")

    @torch.no_grad()  # Disable gradient tracking for inference efficiency
    def analyze_emotion(self, text: str) -> Tuple[str, float, List[Dict]]:
        """
        Analyze the emotional content of a text input.

        Pipeline:
            1. Tokenize the input text (BPE encoding + special tokens)
            2. Forward pass through RoBERTa + classification head
            3. Apply sigmoid to get per-label probabilities
            4. Sort by confidence and return top predictions

        Args:
            text: The user's text input (passphrase, transcribed speech, etc.)
                  Can be any length up to MAX_TOKEN_LENGTH tokens (~200 words).

        Returns:
            Tuple of:
                - top_emotion (str): The highest-confidence emotion label
                - top_score (float): Confidence score for the top emotion (0.0-1.0)
                - all_scores (List[Dict]): Top-K emotions with labels and scores,
                  sorted by descending confidence. Each dict has:
                    {"label": str, "score": float}

        Example:
            >>> classifier = EmotionClassifier()
            >>> emotion, score, details = classifier.analyze_emotion(
            ...     "I'm so happy and grateful for everything!"
            ... )
            >>> print(f"{emotion}: {score:.4f}")
            joy: 0.9234
        """
        # 1. Validate input
        if not text or not text.strip():
            return "neutral", 0.0, [{"label": "neutral", "score": 0.0}]

        # 2. Tokenize
        #    - padding=True: Pad to longest sequence in batch (single input here)
        #    - truncation=True: Truncate to MAX_TOKEN_LENGTH
        #    - return_tensors="pt": Return PyTorch tensors
        inputs = self.tokenizer(
            text,
            padding=True,
            truncation=True,
            max_length=MAX_TOKEN_LENGTH,
            return_tensors="pt",
        )

        # Move input tensors to the same device as the model
        inputs = {key: val.to(self.device) for key, val in inputs.items()}

        # 3. Forward pass
        #    The model outputs raw logits (unnormalized scores) for each label
        outputs = self.model(**inputs)
        logits = outputs.logits  # Shape: (1, 28)

        # 4. Convert logits to probabilities
        #    GoEmotions is multi-label, so we use sigmoid (not softmax).
        #    Each label gets an independent probability.
        #    However, for vault gating we treat it as single-label by
        #    selecting the highest-confidence prediction.
        probabilities = torch.sigmoid(logits).squeeze(0)  # Shape: (28,)

        # 5. Sort by confidence (descending)
        sorted_indices = torch.argsort(probabilities, descending=True)

        # 6. Build results
        all_scores = []
        for idx in sorted_indices[:TOP_K_EMOTIONS]:
            label = self.labels[idx.item()]
            score = probabilities[idx.item()].item()
            all_scores.append({"label": label, "score": score})

        # Top prediction
        top_idx = sorted_indices[0].item()
        top_emotion = self.labels[top_idx]
        top_score = probabilities[top_idx].item()

        return top_emotion, top_score, all_scores

    def get_emotion_profile(self, text: str) -> Dict[str, float]:
        """
        Get the complete emotional profile for a text input.

        Returns a dict mapping ALL 28 emotion labels to their
        confidence scores. Useful for detailed analysis and debugging.

        Args:
            text: Input text to analyze.

        Returns:
            Dict mapping emotion labels to scores, sorted by confidence.
        """
        _, _, _ = self.analyze_emotion(text)  # Ensure model is warm

        # Re-run for full profile
        inputs = self.tokenizer(
            text,
            padding=True,
            truncation=True,
            max_length=MAX_TOKEN_LENGTH,
            return_tensors="pt",
        )
        inputs = {key: val.to(self.device) for key, val in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            probabilities = torch.sigmoid(outputs.logits).squeeze(0)

        profile = {}
        for i, label in enumerate(self.labels):
            profile[label] = probabilities[i].item()

        # Sort by score descending
        return dict(sorted(profile.items(), key=lambda x: x[1], reverse=True))

    def check_target_emotion(
        self, text: str, target: str, threshold: float
    ) -> Tuple[bool, str, float, List[Dict]]:
        """
        Check if the input text triggers a specific target emotion
        above a confidence threshold.

        This is the core vault-gating function.

        Args:
            text: User's text input.
            target: The required emotion label (e.g., "joy").
            threshold: Minimum confidence score required (e.g., 0.85).

        Returns:
            Tuple of:
                - is_match (bool): True if target emotion detected above threshold
                - detected_emotion (str): The actual top emotion detected
                - confidence (float): Confidence score for the detected emotion
                - top_k (List[Dict]): Top-K emotion predictions for display
        """
        detected_emotion, confidence, top_k = self.analyze_emotion(text)

        # Check if the TARGET emotion specifically meets the threshold
        # (not just any emotion — must be the designated unlock emotion)
        target_score = 0.0
        for entry in top_k:
            if entry["label"] == target:
                target_score = entry["score"]
                break

        # If target wasn't in top-K, check the full output
        if target_score == 0.0:
            inputs = self.tokenizer(
                text,
                padding=True,
                truncation=True,
                max_length=MAX_TOKEN_LENGTH,
                return_tensors="pt",
            )
            inputs = {key: val.to(self.device) for key, val in inputs.items()}
            with torch.no_grad():
                outputs = self.model(**inputs)
                probs = torch.sigmoid(outputs.logits).squeeze(0)

            target_idx = self.labels.index(target)
            target_score = probs[target_idx].item()

        is_match = target_score >= threshold

        return is_match, detected_emotion, target_score, top_k
