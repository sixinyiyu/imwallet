import JSEncrypt from "jsencrypt";
import api from "./api";

let cachedPublicKey: string | null = null;

/**
 * Fetch the RSA public key from the server.
 * Caches the key for subsequent calls.
 */
async function fetchPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const { data } = await api.get("/rsa/public-key");
  cachedPublicKey = normalizePem(data.publicKey);
  return cachedPublicKey!;
}

/**
 * Normalize a PEM key string to ensure proper format.
 * Handles cases where newlines are lost or escaped incorrectly
 * (e.g., "\\n" or literal "n" instead of actual newlines).
 */
function normalizePem(pem: string): string {
  // Replace literal \n (escaped backslash-n) with real newlines
  let result = pem.replace(/\\n/g, "\n");
  // Fix cases where newlines were stripped and "n" appears before base64 content
  // e.g., "-----BEGIN PUBLIC KEY-----nMIIBIj..." → "-----BEGIN PUBLIC KEY-----\nMIIBIj..."
  result = result.replace(/-----BEGIN ([A-Z ]+)-----n/g, "-----BEGIN $1-----\n");
  result = result.replace(/-----END ([A-Z ]+)-----n/g, "-----END $1-----\n");
  // Fix "n" between base64 lines (PEM lines should be 64 chars, followed by newline)
  result = result.replace(/([A-Za-z0-9+/=]{64})n/g, "$1\n");
  // Ensure the key ends with a newline before the END marker
  result = result.replace(/\n*-----END/g, "\n-----END");
  return result;
}

/**
 * Encrypt a password string using the server's RSA public key.
 * Returns a base64-encoded encrypted string.
 */
export async function encryptPassword(password: string): Promise<string> {
  const publicKey = await fetchPublicKey();
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const encrypted = encrypt.encrypt(password);
  if (!encrypted) {
    throw new Error("RSA encryption failed");
  }
  return encrypted;
}

/**
 * Clear the cached public key (e.g., on logout or key rotation).
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}
