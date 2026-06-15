import forge from "node-forge";
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
 */
function normalizePem(pem: string): string {
  let result = pem.replace(/\\n/g, "\n");
  result = result.replace(/-----BEGIN ([A-Z ]+)-----n/g, "-----BEGIN $1-----\n");
  result = result.replace(/-----END ([A-Z ]+)-----n/g, "-----END $1-----\n");
  result = result.replace(/([A-Za-z0-9+/=]{64})n/g, "$1\n");
  result = result.replace(/\n*-----END/g, "\n-----END");
  return result;
}

/**
 * Encrypt a password string using the server's RSA public key with OAEP padding.
 * Returns a base64-encoded encrypted string.
 */
export async function encryptPassword(password: string): Promise<string> {
  const publicKeyPem = await fetchPublicKey();
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

  // 使用 OAEP + SHA-256 填充（与服务端 RSA_PKCS1_OAEP_PADDING + oaepHash:"sha256" 对应）
  const encrypted = publicKey.encrypt(password, "RSA-OAEP", {
    md: forge.md.sha256.create(),
  });

  // 转为 base64
  return forge.util.encode64(encrypted);
}

/**
 * Clear the cached public key (e.g., on logout or key rotation).
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}
