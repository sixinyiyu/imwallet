import { generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from "crypto";
import fs from "fs";
import path from "path";

const KEY_DIR = path.resolve(__dirname, "../keys");
const PRIVATE_KEY_PATH = path.join(KEY_DIR, "private.pem");
const PUBLIC_KEY_PATH = path.join(KEY_DIR, "public.pem");

let privateKey: string;
let publicKey: string;

/**
 * Initialize RSA key pair. Generate new keys if they don't exist.
 */
export function initRSAKeys(): void {
  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR, { recursive: true });
  }

  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
    publicKey = fs.readFileSync(PUBLIC_KEY_PATH, "utf-8");
    console.log("🔑 RSA keys loaded from existing files");
    return;
  }

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

  fs.writeFileSync(PRIVATE_KEY_PATH, priv, "utf-8");
  fs.writeFileSync(PUBLIC_KEY_PATH, pub, "utf-8");

  privateKey = priv;
  publicKey = pub;
  console.log("🔑 RSA keys generated and saved");
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