# ============================================================================
# ChronoVault — Facial Recognition Vault | Siamese Network Wrapper
# ============================================================================
# Wraps FaceNet (InceptionResnetV1) from the `facenet-pytorch` library.
#
# FaceNet IS a Siamese architecture:
#   - Trained with triplet loss on the VGGFace2 dataset (3.3M images, 9K ids)
#   - Produces a 512-dimensional embedding where:
#       → Same person's embeddings cluster closely (high cosine similarity)
#       → Different people's embeddings are far apart (low cosine similarity)
#   - This metric learning approach is the core of Siamese networks
#
# The model runs in eval() mode (inference-only). No training happens here.
# All weights are frozen — we only use the forward pass for embedding generation.
# ============================================================================

import torch
import torch.nn.functional as F
from facenet_pytorch import InceptionResnetV1

from config import EMBEDDING_DIM, PRETRAINED_MODEL, get_device


class FaceNetSiamese:
    """
    Siamese Neural Network wrapper for face verification.

    Uses FaceNet (InceptionResnetV1) pre-trained on VGGFace2 to generate
    512-dimensional face embeddings. Verification is performed by computing
    the cosine similarity between two embeddings.

    Attributes:
        device: The compute device (CUDA GPU or CPU).
        model: The loaded InceptionResnetV1 model in eval mode.
    """

    def __init__(self):
        """
        Initialize the FaceNet model.

        Downloads pre-trained weights on first run (~107MB for VGGFace2).
        Subsequent runs load from cache (~/.cache/torch/checkpoints/).
        """
        print("[Model] 🧠 Loading FaceNet (InceptionResnetV1) Siamese Network...")

        # 1. Detect hardware
        self.device = get_device()

        # 2. Load pre-trained model
        #    pretrained='vggface2' → trained on VGGFace2 dataset
        #    classify=False → we want embeddings, not class predictions
        self.model = InceptionResnetV1(
            pretrained=PRETRAINED_MODEL,
            classify=False,  # Embedding mode, not classification
        ).to(self.device)

        # 3. Set to evaluation mode (disables dropout, uses running batch norm stats)
        self.model.eval()

        print(f"[Model] ✅ FaceNet loaded successfully | Device: {self.device}")
        print(f"[Model]    Embedding dimension: {EMBEDDING_DIM}")
        print(f"[Model]    Weights: {PRETRAINED_MODEL}")

    @torch.no_grad()  # Disable gradient computation (saves memory, speeds up inference)
    def generate_embedding(self, face_tensor: torch.Tensor) -> torch.Tensor:
        """
        Generate a 512-dimensional face embedding from an aligned face tensor.

        Args:
            face_tensor: A preprocessed face image tensor of shape (3, 160, 160)
                         as output by MTCNN. Values should be in range [-1, 1].

        Returns:
            A 1D tensor of shape (512,) — the L2-normalized face embedding.

        Security Note:
            The embedding is a mathematical representation of facial geometry.
            It cannot be reverse-engineered back into a recognizable face image
            with current technology (though research on inversion attacks exists).
        """
        # Add batch dimension: (3, 160, 160) → (1, 3, 160, 160)
        if face_tensor.dim() == 3:
            face_tensor = face_tensor.unsqueeze(0)

        # Move to compute device
        face_tensor = face_tensor.to(self.device)

        # Forward pass through FaceNet
        embedding = self.model(face_tensor)

        # L2-normalize the embedding (standard practice for cosine similarity)
        # This ensures ||embedding|| = 1, so dot product = cosine similarity
        embedding = F.normalize(embedding, p=2, dim=1)

        # Remove batch dimension: (1, 512) → (512,)
        return embedding.squeeze(0).cpu()

    def compare_embeddings(
        self, embedding_a: torch.Tensor, embedding_b: torch.Tensor
    ) -> float:
        """
        Compute cosine similarity between two face embeddings.

        Args:
            embedding_a: Reference embedding (from enrollment), shape (512,).
            embedding_b: Live embedding (from webcam), shape (512,).

        Returns:
            Cosine similarity score in range [-1.0, 1.0]:
                > 0.70 → Likely same person (default threshold)
                < 0.40 → Definitely different people
                ≈ 0.50-0.70 → Uncertain zone

        Math:
            cosine_sim(a, b) = (a · b) / (||a|| × ||b||)
            Since both embeddings are L2-normalized, this simplifies to: a · b
        """
        # Ensure both are on CPU for comparison
        a = embedding_a.cpu().float()
        b = embedding_b.cpu().float()

        # Compute cosine similarity
        similarity = F.cosine_similarity(a.unsqueeze(0), b.unsqueeze(0)).item()

        return similarity

    def verify(
        self, reference_embedding: torch.Tensor, live_embedding: torch.Tensor, threshold: float
    ) -> tuple[bool, float]:
        """
        Perform face verification: determine if two embeddings belong to the same person.

        Args:
            reference_embedding: Stored enrollment embedding, shape (512,).
            live_embedding: Live webcam embedding, shape (512,).
            threshold: Cosine similarity threshold for a positive match.

        Returns:
            Tuple of (is_match: bool, similarity_score: float).
        """
        similarity = self.compare_embeddings(reference_embedding, live_embedding)
        is_match = similarity >= threshold
        return is_match, similarity
