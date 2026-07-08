/**
 * Platform-safe crypto wrapper.
 *
 * - Native (iOS/Android): uses react-native-quick-crypto (which depends on
 *   react-native-quick-base64 via TurboModuleRegistry)
 * - Web: uses the browser's native crypto.subtle API (PBKDF2, SHA-256)
 *
 * This avoids importing react-native-quick-crypto on Web, which would
 * trigger TurboModuleRegistry.getEnforcing('QuickBase64') and crash
 * because TurboModuleRegistry is undefined in react-native-web.
 */

import { Platform } from "react-native";

// ── PBKDF2 constants (shared across both implementations) ──
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_PASSWORD = "imwallet_password_salt_v2";
export const PBKDF2_SALT_MNEMONIC = "imwallet_mnemonic_salt_v2";

// ── Native implementation (lazy-loaded to avoid Web crash) ──

let QuickCrypto: any = null;

function getQuickCrypto(): any {
  if (!QuickCrypto) {
    QuickCrypto = require("react-native-quick-crypto").default;
  }
  return QuickCrypto;
}

// ── Web implementation using browser crypto.subtle ──

/** Web: PBKDF2 via crypto.subtle — returns hex string */
async function webPbkdf2Hex(
  password: string,
  salt: string,
  iterations: number,
  keyLengthBytes: number,
  hashAlg: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations,
      hash: hashAlg,
    },
    keyMaterial,
    keyLengthBytes * 8 // bits, not bytes
  );

  const bytes = new Uint8Array(derivedBits);
  return Array.from(bytes as Uint8Array)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Web: SHA-256 via crypto.subtle — returns hex string */
async function webSha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Unified API (sync on native, async on web) ──

/**
 * Compute PBKDF2-SHA256 hex hash.
 *
 * - Native: synchronous (react-native-quick-crypto.pbkdf2Sync)
 * - Web: asynchronous (crypto.subtle.deriveBits)
 *
 * IMPORTANT: On Web this is async! Callers must use `await`.
 */
export function pbkdf2Hex(
  password: string,
  salt: string,
  iterations: number,
  keyLengthBytes: number,
  hashAlg: string
): string | Promise<string> {
  if (Platform.OS === "web") {
    return webPbkdf2Hex(password, salt, iterations, keyLengthBytes, hashAlg);
  }
  const derived = getQuickCrypto().pbkdf2Sync(password, salt, iterations, keyLengthBytes, hashAlg);
  return derived.toString("hex");
}

/**
 * Compute SHA-256 hex hash (legacy v1).
 *
 * - Native: synchronous (@noble/hashes/sha256)
 * - Web: asynchronous (crypto.subtle.digest)
 *
 * IMPORTANT: On Web this is async! Callers must use `await`.
 */
export function sha256Hex(input: string): string | Promise<string> {
  if (Platform.OS === "web") {
    return webSha256Hex(input);
  }
  // On native, use the already-imported @noble/hashes (no TurboModule dependency)
  const { sha256 } = require("@noble/hashes/sha2");
  const data = new TextEncoder().encode(input);
  const bytes: Uint8Array = sha256(data);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}