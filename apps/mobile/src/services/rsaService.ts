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
  cachedPublicKey = data.publicKey;
  return cachedPublicKey!;
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