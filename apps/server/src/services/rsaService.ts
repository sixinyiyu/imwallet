import { generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from "crypto";

let privateKey: string;
let publicKey: string;

/**
 * Initialize RSA key pair.
 * Priority: environment variables > auto-generate in memory
 * In production, keys should be set via RSA_PRIVATE_KEY and RSA_PUBLIC_KEY env vars.
 * In development, keys are auto-generated and kept in memory only.
 */
export function initRSAKeys(): void {
  // 1. Try loading from environment variables (production)
  const envPrivateKey = process.env.RSA_PRIVATE_KEY;
  const envPublicKey = process.env.RSA_PUBLIC_KEY;

  if (envPrivateKey && envPublicKey) {
    privateKey = envPrivateKey.replace(/\\n/g, "\n");
    publicKey = envPublicKey.replace(/\\n/g, "\n");
    console.log("🔑 RSA keys loaded from environment variables");
    return;
  }

  // 2. Auto-generate (development / first run)
  const { publicKey: pub, privateKey: priv } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  privateKey = priv;
  publicKey = pub;
  console.log("🔑 RSA keys auto-generated (set RSA_PRIVATE_KEY/RSA_PUBLIC_KEY env vars for production)");
}

/**
 * Get the public key (for client-side encryption).
 * Returns the PEM-formatted public key string.
 */
export function getPublicKey(): string {
  return publicKey;
}

/**
 * Decrypt a password that was encrypted with the public key on the client side.
 * The encrypted value should be a base64-encoded string.
 */
export function decryptPassword(encryptedBase64: string): string {
  const buffer = Buffer.from(encryptedBase64, "base64");
  const decrypted = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return decrypted.toString("utf-8");
}
