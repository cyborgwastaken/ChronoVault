import numpy as np
from fastapi import HTTPException

from biometric_mvp.model import BiometricModel


class BiometricPresenter:
    def __init__(self, model: BiometricModel, default_threshold: float) -> None:
        self.model = model
        self.default_threshold = default_threshold

    def health(self) -> dict:
        result = {
            "status": "ok",
            "model": self.model.model_name,
            "device": str(self.model.device),
            "threshold": self.default_threshold,
            "pattern": "MVP",
        }
        if hasattr(self.model, "available"):
            result["available"] = bool(self.model.available)
        if getattr(self.model, "init_error", ""):
            result["init_error"] = self.model.init_error
        return result

    def enroll(self, image_base64: str) -> dict:
        embedding = self.model.extract_embedding(image_base64)
        return {
            "embedding": embedding.astype(float).tolist(),
            "embedding_hash": self.model.hash_embedding(embedding),
            "model_name": self.model.model_name,
            "captures_used": 1,
        }

    def enroll_batch(self, images_base64: list[str]) -> dict:
        embedding = self.model.aggregate_embeddings(images_base64)
        return {
            "embedding": embedding.astype(float).tolist(),
            "embedding_hash": self.model.hash_embedding(embedding),
            "model_name": self.model.model_name,
            "captures_used": min(5, len(images_base64)),
        }

    def verify(self, image_base64: str, stored_embedding: list[float], stored_hash: str, threshold: float) -> dict:
        if not stored_embedding:
            raise HTTPException(status_code=400, detail="Stored embedding is required")

        try:
            stored = np.array(stored_embedding, dtype=np.float32)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Stored embedding payload is invalid") from exc

        if stored.ndim != 1:
            raise HTTPException(status_code=400, detail="Stored embedding must be a 1D vector")

        live = self.model.extract_embedding(image_base64)

        stored_norm = np.linalg.norm(stored)
        if stored_norm <= 0:
            raise HTTPException(status_code=400, detail="Stored embedding norm is invalid")
        stored = stored / stored_norm

        similarity = float(np.dot(live, stored))
        live_hash = self.model.hash_embedding(live)
        stored_hash_calculated = self.model.hash_embedding(stored)

        stored_hash_integrity = stored_hash_calculated == stored_hash
        matched = similarity >= threshold and stored_hash_integrity

        return {
            "matched": matched,
            "similarity": similarity,
            "threshold": threshold,
            "live_hash": live_hash,
            "stored_hash_integrity": stored_hash_integrity,
            "live_hash_match": live_hash == stored_hash,
        }
