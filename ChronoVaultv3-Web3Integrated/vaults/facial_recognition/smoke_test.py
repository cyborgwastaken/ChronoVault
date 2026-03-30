"""
ChronoVault - Facial Recognition Vault | Smoke Test
Validates that all components load and function correctly.
"""

import sys
import torch

sys.path.insert(0, ".")

print("=" * 60)
print("  SMOKE TEST: ChronoVault Facial Recognition Vault")
print("=" * 60)
print()

# Test 1: Config
print("[1/7] Testing config...")
from config import get_device, SIMILARITY_THRESHOLD, EMBEDDING_DIM
device = get_device()
print(f"      Threshold: {SIMILARITY_THRESHOLD}")
print(f"      Embedding dim: {EMBEDDING_DIM}")
print("      PASSED")
print()

# Test 2: Model loads
print("[2/7] Loading FaceNet Siamese Network...")
from model import FaceNetSiamese
siamese = FaceNetSiamese()
print("      PASSED")
print()

# Test 3: Detector loads
print("[3/7] Loading MTCNN face detector...")
from face_detector import FaceDetector
detector = FaceDetector()
print("      PASSED")
print()

# Test 4: Crypto roundtrip
print("[4/7] Testing AES-256-GCM crypto roundtrip...")
from utils import encrypt_bytes, decrypt_bytes
test_data = b"Hello ChronoVault - super secret data"
encrypted = encrypt_bytes(test_data, "testpin1234")
decrypted = decrypt_bytes(encrypted, "testpin1234")
assert decrypted == test_data, "Crypto roundtrip FAILED!"
# Also test wrong password
bad_decrypt = decrypt_bytes(encrypted, "wrongpin")
assert bad_decrypt is None, "Wrong password should return None!"
print("      Encrypt/Decrypt roundtrip: PASSED")
print("      Wrong password rejection:  PASSED")
print()

# Test 5: Embedding store
print("[5/7] Testing embedding store...")
from embedding_store import EmbeddingStore
store = EmbeddingStore()
# Save and load a dummy embedding
dummy_emb = torch.randn(512)
dummy_emb = torch.nn.functional.normalize(dummy_emb, p=2, dim=0)
store.save_embedding(dummy_emb, "smoke_test_user", "testpin")
loaded_emb = store.load_embedding("smoke_test_user", "testpin")
assert loaded_emb is not None, "Failed to load embedding!"
diff = torch.abs(dummy_emb - loaded_emb).max().item()
assert diff < 1e-6, f"Embedding mismatch! Max diff: {diff}"
# Clean up
store.delete_enrollment("smoke_test_user")
print("      Save/Load roundtrip: PASSED")
print(f"      Max diff: {diff:.2e} (should be ~0)")
print()

# Test 6: Mock unlock
print("[6/7] Testing mock vault unlock...")
from vault_unlock import mock_unlock
payload = mock_unlock("smoke_test", 0.95)
assert payload["status"] == "VAULT_UNLOCKED"
assert len(payload["mock_aes_key"]) == 64  # 32 bytes hex = 64 chars
print(f"      Status: {payload['status']}")
print(f"      Key (first 16): {payload['mock_aes_key'][:16]}...")
print("      PASSED")
print()

# Test 7: Generate embedding from dummy face tensor
print("[7/7] Testing embedding generation...")
dummy_face = torch.randn(3, 160, 160)
embedding = siamese.generate_embedding(dummy_face)
assert embedding.shape == (512,), f"Bad shape: {embedding.shape}"
l2_norm = torch.norm(embedding).item()
assert abs(l2_norm - 1.0) < 0.01, f"L2 norm should be ~1.0, got {l2_norm}"

# Test similarity comparison
emb2 = siamese.generate_embedding(dummy_face)  # Same input
sim = siamese.compare_embeddings(embedding, emb2)
assert sim > 0.99, f"Same input should give similarity ~1.0, got {sim}"
print(f"      Shape: {embedding.shape}")
print(f"      L2 norm: {l2_norm:.4f}")
print(f"      Self-similarity: {sim:.4f}")
print("      PASSED")
print()

print("=" * 60)
print("  ALL 7 SMOKE TESTS PASSED")
print("=" * 60)
print()
print("  Next steps:")
print("    1. python enroll.py --user-id <your_name>")
print("    2. python verify.py --user-id <your_name>")
print("=" * 60)
