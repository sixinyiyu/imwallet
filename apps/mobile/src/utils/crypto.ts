/**
 * Platform-safe crypto wrapper.
 *
 * - Native (iOS/Android): uses our lightweight Pbkdf2 native module
 *   (system crypto APIs: javax.crypto on Android, CommonCrypto on iOS)
 * - Web: uses the browser's native crypto.subtle API (PBKDF2, SHA-256)
 *
 * This replaces react-native-quick-crypto (which adds ~12MB of OpenSSL + simdutf)
 * with a ~0.3-0.5MB native module that only does PBKDF2.
 */

import { Platform, NativeModules } from "react-native";

// ── PBKDF2 constants (shared across both implementations) ──
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_PASSWORD = "imwallet_password_salt_v2";
export const PBKDF2_SALT_MNEMONIC = "imwallet_mnemonic_salt_v2";

// ── Native module reference ──
const Pbkdf2Native = NativeModules.Pbkdf2;

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

// ── Unified API (async on all platforms) ──

/**
 * Compute PBKDF2-SHA256 hex hash.
 *
 * - Native: asynchronous (NativeModules.Pbkdf2.derive → Promise)
 * - Web: asynchronous (crypto.subtle.deriveBits)
 *
 * IMPORTANT: This is always async! Callers must use `await`.
 */
export async function pbkdf2Hex(
  password: string,
  salt: string,
  iterations: number,
  keyLengthBytes: number,
  hashAlg: string
): Promise<string> {
  if (Platform.OS === "web") {
    return webPbkdf2Hex(password, salt, iterations, keyLengthBytes, hashAlg);
  }
  if (!Pbkdf2Native) {
    // Fallback: use @noble/hashes if native module is not available
    const { pbkdf2 } = require("@noble/hashes/pbkdf2");
    const { sha256 } = require("@noble/hashes/sha2");
    const hashFn = hashAlg === "sha256" ? sha256 : require("@noble/hashes/sha2")[hashAlg];
    const derived = pbkdf2(hashFn, password, new TextEncoder().encode(salt), { c: iterations, dkLen: keyLengthBytes });
    return Array.from(derived as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Pbkdf2Native.derive(password, salt, iterations, keyLengthBytes, hashAlg);
}

/**
 * Compute SHA-256 hex hash (legacy v1).
 *
 * - Native: synchronous (@noble/hashes/sha256) — no TurboModule dependency
 * - Web: asynchronous (crypto.subtle.digest)
 *
 * IMPORTANT: On Web this is async! Callers must use `await`.
 */
export function sha256Hex(input: string): string | Promise<string> {
  if (Platform.OS === "web") {
    return webSha256Hex(input);
  }
  // On native, use the already-imported @noble/hashes (no native module dependency)
  const { sha256 } = require("@noble/hashes/sha2");
  const data = new TextEncoder().encode(input);
  const bytes: Uint8Array = sha256(data);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}