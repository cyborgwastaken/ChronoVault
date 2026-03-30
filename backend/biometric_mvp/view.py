from typing import List

from pydantic import BaseModel, Field


class EnrollRequest(BaseModel):
    image_base64: str


class EnrollBatchRequest(BaseModel):
    images_base64: List[str] = Field(default_factory=list)


class VerifyRequest(BaseModel):
    image_base64: str
    stored_embedding: List[float]
    stored_hash: str
    threshold: float = Field(default=0.72, ge=0.1, le=1.0)
