"""
ChronoVault - Emotional State Vault | Smoke Test
Validates that the NLP model loads and basic classification works.
"""

import sys
sys.path.insert(0, ".")

print("=" * 60)
print("  SMOKE TEST: ChronoVault Emotional State Vault")
print("=" * 60)
print()

# Test 1: Config
print("[1/4] Testing config...")
from config import get_device, TARGET_EMOTION, CONFIDENCE_THRESHOLD, MODEL_NAME
device = get_device()
print(f"      Target Emotion: {TARGET_EMOTION}")
print(f"      Threshold: {CONFIDENCE_THRESHOLD}")
print(f"      Model: {MODEL_NAME}")
print("      PASSED")
print()

# Test 2: Model loads
print("[2/4] Loading RoBERTa classifier...")
from model import EmotionClassifier
classifier = EmotionClassifier()
print("      PASSED")
print()

# Test 3: Inference / Classification
print(f"[3/4] Testing text classification (Target: {TARGET_EMOTION})...")
test_text_pass = "I am absolutely thrilled and so happy about this wonderful news!"
test_text_fail = "I am extremely angry and frustrated with this situation."

# Should PASS
is_match, emotion, score, top_k = classifier.check_target_emotion(
    test_text_pass, "joy", 0.50  # Lower threshold just for test certainty
)
assert is_match is True, f"Failed to detect joy in test text. Top emotion: {emotion}"
print("      Pass-case detection: PASSED")

# Should FAIL
is_match_fail, emotion_fail, score_fail, top_k_fail = classifier.check_target_emotion(
    test_text_fail, "joy", 0.50
)
assert is_match_fail is False, f"Falsely detected joy in angry text! Top emotion: {emotion_fail}"
assert emotion_fail == "anger", f"Expected to detect anger, got: {emotion_fail}"
print("      Fail-case rejection: PASSED")
print()

# Test 4: Mock unlock
print("[4/4] Testing mock vault unlock...")
from vault_unlock import mock_unlock
payload = mock_unlock("smoke_test", "joy", 0.95)
assert payload["status"] == "VAULT_UNLOCKED"
assert len(payload["mock_aes_key"]) == 64  # 32 bytes hex = 64 chars
print(f"      Status: {payload['status']}")
print(f"      Key (first 16): {payload['mock_aes_key'][:16]}...")
print("      PASSED")
print()

print("=" * 60)
print("  ALL 4 SMOKE TESTS PASSED")
print("=" * 60)
print()
