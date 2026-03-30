import base64
import hashlib
import io
from typing import List

import numpy as np
from fastapi import HTTPException


class BiometricModel:
    def __init__(self) -> None:
        self.model_name = "facenet-vggface2-siamese-embedding"
        self.available = False
        self.init_error = ""
        self.device = "cpu"
        self.detector = None
        self.embedder = None
        self._torch = None
        self._Image = None

        try:
            import torch  # type: ignore
            from facenet_pytorch import InceptionResnetV1, MTCNN  # type: ignore
            from PIL import Image  # type: ignore

            self._torch = torch
            self._Image = Image
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.detector = MTCNN(image_size=160, margin=16, device=self.device)
            self.embedder = InceptionResnetV1(pretrained="vggface2").eval().to(self.device)
            self.available = True
        except Exception as exc:
            self.init_error = str(exc)

    def _ensure_available(self) -> None:
        if self.available:
            return
        raise HTTPException(
            status_code=503,
            detail=(
                "Biometric model dependencies are unavailable. "
                "Install requirements-biometric.txt in a supported Python (recommended 3.11). "
                f"Root error: {self.init_error or 'unknown'}"
            ),
        )

    def parse_image(self, image_base64: str):
        self._ensure_available()
        payload = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
        try:
            raw = base64.b64decode(payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid base64 image payload") from exc

        try:
            return self._Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid image content") from exc

    def extract_embedding(self, image_base64: str) -> np.ndarray:
        self._ensure_available()
        image = self.parse_image(image_base64)
        face = self.detector(image)
        if face is None:
            raise HTTPException(status_code=422, detail="No face detected. Keep one face centered and retry.")

        with self._torch.no_grad():
            vector = self.embedder(face.unsqueeze(0).to(self.device)).cpu().numpy()[0]

        norm = np.linalg.norm(vector)
        if norm <= 0:
            raise HTTPException(status_code=500, detail="Failed to normalize embedding")

        return vector / norm

    @staticmethod
    def hash_embedding(embedding: np.ndarray) -> str:
        quantized = np.round(embedding.astype(np.float32), 6)
        return hashlib.sha256(quantized.tobytes()).hexdigest()

    def aggregate_embeddings(self, images_base64: List[str]) -> np.ndarray:
        if len(images_base64) < 5:
            raise HTTPException(status_code=400, detail="At least 5 face captures are required")

        vectors = [self.extract_embedding(img) for img in images_base64[:5]]
        stacked = np.vstack(vectors)
        avg = stacked.mean(axis=0)

        norm = np.linalg.norm(avg)
        if norm <= 0:
            raise HTTPException(status_code=500, detail="Failed to normalize aggregated embedding")

        return avg / norm
