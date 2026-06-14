import { generateKeyPairSync, privateDecrypt, constants } from "crypto";
import { readFileSync, existsSync } from "fs";

let privateKey: string;
let publicKey: string;

/**
 * Normalize a PEM key string to ensure proper newlines.
 * Handles cases where systemd EnvironmentFile stripped backslashes.
 */
function normalizePem(pem: string): string {
  let result = pem.replace(/\\n/g, "\n");
  result = result.replace(/-----BEGIN [A-Z ]+-----n/g, (m) => m.replace(/n$/, "\n"));
  result = result.replace(/-----END [A-Z ]+-----n/g, (m) => m.replace(/n$/, "\n"));
  result = result.replace(/([A-Za-z0-9+/=]{64})n/g, "$1\n");
  result = result.replace(/\n*-----END/g, "\n-----END");
  if (!result.endsWith("\n")) {
    result += "\n";
  }
  return result;
}

/**
 * Initialize RSA key pair.
 * Priority:
 *   1. File paths (RSA_PRIVATE_KEY_PATH / RSA_PUBLIC_KEY_PATH) — recommended for production
 *   2. Inline strings (RSA_PRIVATE_KEY / RSA_PUBLIC_KEY) — prone to newline escaping issues
 *   3. Auto-generate in memory — development only
 */
export function initRSAKeys(): void {
  // 1. Try loading from file paths (recommended for production)
  const privateKeyPath = process.env.RSA_PRIVATE_KEY_PATH;
  const publicKeyPath = process.env.RSA_PUBLIC_KEY_PATH;

  if (privateKeyPath && publicKeyPath) {
    if (!existsSync(privateKeyPath)) {
      console.error(`🔑 RSA private key file not found: ${privateKeyPath}`);
    }
    if (!existsSync(publicKeyPath)) {
      console.error(`🔑 RSA public key file not found: ${publicKeyPath}`);
    }
    if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
      privateKey = readFileSync(privateKeyPath, "utf-8");
      publicKey = readFileSync(publicKeyPath, "utf-8");
      console.log(`🔑 RSA keys loaded from files (${privateKeyPath}, ${publicKeyPath})`);
      return;
    }
  }

  // 2. Try loading from environment variables (inline strings)
  const envPrivateKey = process.env.RSA_PRIVATE_KEY;
  const envPublicKey = process.env.RSA_PUBLIC_KEY;

  if (envPrivateKey && envPublicKey) {
    privateKey = normalizePem(envPrivateKey);
    publicKey = normalizePem(envPublicKey);
    console.log("🔑 RSA keys loaded from environment variables");
    return;
  }

  // 3. Auto-generate (development / first run)
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
  console.log("🔑 RSA keys auto-generated (set RSA_PRIVATE_KEY_PATH/RSA_PUBLIC_KEY_PATH for production)");
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
