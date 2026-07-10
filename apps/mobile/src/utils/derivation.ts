/**
 * 客户端 BIP44 HD 钱包地址派生工具
 *
 * 使用纯 JS 加密库（@scure/bip32, @scure/bip39, @noble/hashes, @scure/base），
 * 跨平台兼容（Native + Web），无需 Node.js 原生模块。
 *
 * 派生流程：
 *   Mnemonic (12/24 words)
 *       ↓ BIP39: PBKDF2-SHA512 (2048 iterations)
 *   Seed (64 bytes)
 *       ↓ BIP32: HMAC-SHA512
 *   Master Private Key + Chain Code
 *       ↓ BIP44: m/44'/coin_id'/0'/0/index
 *   Chain-specific Private Key → Public Key → Address
 *
 * 支持的链：
 *   - Ethereum (ETH):   m/44'/60'/0'/0/index  → 0x... address
 *   - Tron (TRX):       m/44'/195'/0'/0/index → T... address
 *   - Bitcoin (BTC):    m/44'/0'/0'/0/index   → 1... address (legacy P2PKH)
 */

import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base58 } from "@scure/base";
import { pbkdf2Hex } from "../utils/crypto";
import { Platform } from "react-native";

// ─── BIP44 Derivation Path Constants ───

const BIP44_PATHS: Record<string, string> = {
  Ethereum: "m/44'/60'/0'/0",
  Tron: "m/44'/195'/0'/0",
  Bitcoin: "m/44'/0'/0'/0",
};

// ─── BIP39 Seed Derivation (Native PBKDF2-SHA512) ───

/**
 * BIP39: mnemonic → seed (64 bytes)
 *
 * Uses native PBKDF2-SHA512 (2048 iterations) when available,
 * falls back to @scure/bip39 JS implementation on web.
 *
 * IMPORTANT: This is async on native! Callers must use `await`.
 */
async function mnemonicToSeed(mnemonic: string, passphrase = ""): Promise<Uint8Array> {
  // BIP39 spec: password = NFKD(mnemonic), salt = NFKD("mnemonic" + passphrase)
  const password = mnemonic.normalize("NFKD");
  const salt = `mnemonic${passphrase}`.normalize("NFKD");

  if (Platform.OS === "web") {
    // Web: use @scure/bip39 (crypto.subtle based)
    return mnemonicToSeedSync(mnemonic, passphrase);
  }

  // Native: use Pbkdf2Module (javax.crypto / CommonCrypto)
  const hexSeed = await pbkdf2Hex(password, salt, 2048, 64, "sha512");
  // hex string → Uint8Array
  const seed = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    seed[i] = parseInt(hexSeed.substring(i * 2, i * 2 + 2), 16);
  }
  return seed;
}

// ─── Helpers ───

/** Uint8Array → hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Base58Check 编码：payload + first 4 bytes of double-SHA256 checksum */
function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const encoded = new Uint8Array(payload.length + 4);
  encoded.set(payload, 0);
  encoded.set(checksum, payload.length);
  return base58.encode(encoded);
}

// ─── Chain-Specific Address Derivation ───

/**
 * Derive an Ethereum address from mnemonic at a given index.
 * Path: m/44'/60'/0'/0/index
 *
 * Ethereum address = keccak256(publicKey without 0x04 prefix)[last 20 bytes]
 */
function deriveEthereumAddress(seed: Uint8Array, index: number): string {
  const hdKey = HDKey.fromMasterSeed(seed);
  const childKey = hdKey.derive(`${BIP44_PATHS.Ethereum}/${index}`);
  if (!childKey.publicKey) throw new Error("Failed to derive Ethereum public key");

  // Remove 0x04 prefix from uncompressed public key, take last 64 bytes
  const pubBytes = childKey.publicKey.slice(1);
  const hash = keccak_256(pubBytes);
  return "0x" + bytesToHex(hash.slice(-20));
}

/**
 * Derive a Tron address from mnemonic at a given index.
 * Path: m/44'/195'/0'/0/index
 *
 * Tron address = base58check(0x41 + keccak256(publicKey without 0x04 prefix)[last 20 bytes])
 */
function deriveTronAddress(seed: Uint8Array, index: number): string {
  const hdKey = HDKey.fromMasterSeed(seed);
  const childKey = hdKey.derive(`${BIP44_PATHS.Tron}/${index}`);
  if (!childKey.publicKey) throw new Error("Failed to derive Tron public key");

  // Same keccak256 hash as Ethereum, but with 0x41 prefix
  const pubBytes = childKey.publicKey.slice(1);
  const hash = keccak_256(pubBytes);

  const addrBytes = new Uint8Array(21);
  addrBytes[0] = 0x41; // Tron mainnet prefix
  addrBytes.set(hash.slice(-20), 1);

  return base58CheckEncode(addrBytes);
}

/**
 * Derive a Bitcoin (legacy P2PKH) address from mnemonic at a given index.
 * Path: m/44'/0'/0'/0/index
 *
 * Bitcoin address = base58check(0x00 + RIPEMD160(SHA256(compressedPublicKey)))
 */
function deriveBitcoinAddress(seed: Uint8Array, index: number): string {
  const hdKey = HDKey.fromMasterSeed(seed);
  const childKey = hdKey.derive(`${BIP44_PATHS.Bitcoin}/${index}`);
  if (!childKey.publicKey) throw new Error("Failed to derive Bitcoin public key");

  // Compressed public key (33 bytes) → SHA256 → RIPEMD160
  const hash = ripemd160(sha256(childKey.publicKey));

  const addrBytes = new Uint8Array(21);
  addrBytes[0] = 0x00; // Bitcoin mainnet P2PKH version byte
  addrBytes.set(hash, 1);

  return base58CheckEncode(addrBytes);
}

// ─── Unified Derivation Entry Point ───

/**
 * Derive a deterministic address from mnemonic for a given network.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @param network - Blockchain network name ("Ethereum", "Tron", "Bitcoin")
 * @param index - Account index (default 0)
 * @returns Deterministic address for the specified network
 */
export async function deriveAddressFromMnemonic(
  mnemonic: string,
  network: string,
  index: number = 0
): Promise<string> {
  const seed = await mnemonicToSeed(mnemonic);

  switch (network) {
    case "Ethereum":
    case "ETH":
      return deriveEthereumAddress(seed, index);

    case "Tron":
    case "TRX":
      return deriveTronAddress(seed, index);

    case "Bitcoin":
    case "BTC":
      return deriveBitcoinAddress(seed, index);

    default:
      // For unknown networks, use Ethereum-style derivation as fallback
      return deriveEthereumAddress(seed, index);
  }
}

/**
 * Get the BIP44 derivation path for a given network.
 * @param network - Blockchain network name
 * @param index - Account index
 * @returns Full derivation path (e.g., "m/44'/60'/0'/0/0")
 */
export function getDerivationPath(network: string, index: number = 0): string {
  const basePath = BIP44_PATHS[network] || BIP44_PATHS.Ethereum;
  return `${basePath}/${index}`;
}