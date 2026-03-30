const BIOMETRIC_API_URL = import.meta.env.VITE_BIOMETRIC_API_URL || 'http://localhost:8090';

async function parseError(response, fallback) {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed.detail || parsed.error || fallback;
  } catch {
    return text;
  }
}

async function safeFetch(url, options, fallbackMessage) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(`${fallbackMessage}. Biometric service is offline at ${BIOMETRIC_API_URL}.`);
  }
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin) {
  return sha256Hex(pin.trim());
}

export async function enrollBiometric(imageBase64) {
  const response = await safeFetch(`${BIOMETRIC_API_URL}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  }, 'Biometric enrollment failed');

  if (!response.ok) {
    throw new Error(await parseError(response, 'Biometric enrollment failed'));
  }

  return response.json();
}

export async function enrollBiometricBatch(imagesBase64) {
  const response = await safeFetch(`${BIOMETRIC_API_URL}/enroll-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images_base64: imagesBase64 }),
  }, 'Biometric batch enrollment failed');

  if (!response.ok) {
    throw new Error(await parseError(response, 'Biometric batch enrollment failed'));
  }

  return response.json();
}

export async function verifyBiometric({ imageBase64, storedEmbedding, storedHash, threshold = 0.72 }) {
  const response = await safeFetch(`${BIOMETRIC_API_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      stored_embedding: storedEmbedding,
      stored_hash: storedHash,
      threshold,
    }),
  }, 'Biometric verification failed');

  if (!response.ok) {
    throw new Error(await parseError(response, 'Biometric verification failed'));
  }

  return response.json();
}

export async function checkBiometricServiceHealth() {
  const response = await safeFetch(`${BIOMETRIC_API_URL}/health`, {}, 'Biometric service health check failed');
  if (!response.ok) {
    throw new Error('Biometric service is unavailable');
  }
  return response.json();
}
