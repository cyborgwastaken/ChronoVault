import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from biometric_mvp.model import BiometricModel
from biometric_mvp.presenter import BiometricPresenter
from biometric_mvp.view import EnrollBatchRequest, EnrollRequest, VerifyRequest


DEFAULT_THRESHOLD = float(os.getenv("BIOMETRIC_THRESHOLD", "0.72"))

app = FastAPI(title="ChronoVault Biometric Service", version="1.0.0")

allowed_origin = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = BiometricModel()
presenter = BiometricPresenter(model=model, default_threshold=DEFAULT_THRESHOLD)


@app.get("/health")
def health_check():
    return presenter.health()


@app.post("/enroll")
def enroll(req: EnrollRequest):
    return presenter.enroll(req.image_base64)


@app.post("/enroll-batch")
def enroll_batch(req: EnrollBatchRequest):
    return presenter.enroll_batch(req.images_base64)


@app.post("/verify")
def verify(req: VerifyRequest):
    return presenter.verify(
        image_base64=req.image_base64,
        stored_embedding=req.stored_embedding,
        stored_hash=req.stored_hash,
        threshold=req.threshold,
    )
