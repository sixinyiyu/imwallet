/**
 * BIP39/BIP44 HD Wallet Derivation Service
 *
 * Standard deterministic derivation flow:
 *   Mnemonic (12/24 words)
 *       ↓ BIP39: PBKDF2-SHA512 (2048 iterations)
 *   Seed (64 bytes)
 *       ↓ BIP32: HMAC-SHA512
 *   Master Private Key + Chain Code
 *       ↓ BIP44: m/44'/coin_id'/0'/0/index
 *   Chain-specific Private Key → Public Key → Address
 *
 * Supported chains:
 *   - Ethereum (ETH):   m/44'/60'/0'/0/index  → 0x... address
 *   - Tron (TRX):       m/44'/195'/0'/0/index → T... address
 *   - Bitcoin (BTC):    m/44'/0'/0'/0/index   → 1... address (legacy P2PKH)
 */

import * as bip39 from "bip39";
import HDKey from "hdkey";
import { ethers } from "ethers";
import * as TronWebModule from "tronweb";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";

// Initialize ECPair with secp256k1 for bitcoinjs-lib
const ECPair = ECPairFactory(ecc);

// TronWeb module handling (ESM/CJS compatibility)
const TronWeb = (TronWebModule as any).default?.TronWeb
  || (TronWebModule as any).TronWeb
  || (TronWebModule as any).default;

// ─── BIP44 Derivation Path Constants ───

const BIP44_PATHS: Record<string, string> = {
  Ethereum: "m/44'/60'/0'/0",
  Tron: "m/44'/195'/0'/0",
  Bitcoin: "m/44'/0'/0'/0",
  // Default fallback for unknown networks
  Private: "m/44'/60'/0'/0",
};

// ─── Mnemonic → Seed ───

/**
 * Convert a BIP39 mnemonic phrase to a 64-byte seed using PBKDF2-SHA512.
 * This is the standard BIP39 derivation step.
 *
 * @param mnemonic - The BIP39 mnemonic phrase (12 or 24 words)
 * @returns 64-byte seed as hex string
 */
export async function mnemonicToSeed(mnemonic: string): Promise<string> {
  const seedBuffer = await bip39.mnemonicToSeed(mnemonic);
  return seedBuffer.toString("hex");
}

// ─── HD Key Derivation ───

/**
 * Derive an HDKey from a mnemonic seed at a given BIP44 base path.
 *
 * @param seedHex - 64-byte seed as hex string
 * @param basePath - BIP44 base path (e.g., "m/44'/60'/0'/0")
 * @returns HDKey at the specified path
 */
function deriveHDKeyFromSeed(seedHex: string, basePath: string): HDKey {
  const hdKey = HDKey.fromMasterSeed(Buffer.from(seedHex, "hex"));
  return hdKey.derive(basePath);
}

// ─── Chain-Specific Address Derivation ───

/**
 * Derive an Ethereum address from mnemonic at a given index.
 * Path: m/44'/60'/0'/0/index
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param index - Account index (default 0)
 * @returns Ethereum address (0x...)
 */
export async function deriveEthereumAddress(
  mnemonic: string,
  index: number = 0
): Promise<string> {
  const seedHex = await mnemonicToSeed(mnemonic);
  const basePath = BIP44_PATHS.Ethereum;
  const hdKey = deriveHDKeyFromSeed(seedHex, basePath);
  const childKey = hdKey.deriveChild(index);

  // Use ethers.js to derive address from private key
  const wallet = new ethers.Wallet(childKey.privateKey!.toString("hex").padStart(64, "0"));
  return wallet.address;
}

/**
 * Derive a Tron address from mnemonic at a given index.
 * Path: m/44'/195'/0'/0/index
 *
 * Tron address derivation:
 *   1. Derive private key via BIP44 path
 *   2. Use TronWeb.address.fromPrivateKey to get T... address
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param index - Account index (default 0)
 * @returns Tron address (T...)
 */
export async function deriveTronAddress(
  mnemonic: string,
  index: number = 0
): Promise<string> {
  const seedHex = await mnemonicToSeed(mnemonic);
  const basePath = BIP44_PATHS.Tron;
  const hdKey = deriveHDKeyFromSeed(seedHex, basePath);
  const childKey = hdKey.deriveChild(index);

  const privateKeyHex = childKey.privateKey!.toString("hex").padStart(64, "0");

  // Use TronWeb static method to derive address from private key
  const address = TronWeb.address.fromPrivateKey(privateKeyHex);
  return address;
}

/**
 * Derive a Bitcoin (legacy P2PKH) address from mnemonic at a given index.
 * Path: m/44'/0'/0'/0/index
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param index - Account index (default 0)
 * @returns Bitcoin address (1...)
 */
export async function deriveBitcoinAddress(
  mnemonic: string,
  index: number = 0
): Promise<string> {
  const seedHex = await mnemonicToSeed(mnemonic);
  const basePath = BIP44_PATHS.Bitcoin;
  const hdKey = deriveHDKeyFromSeed(seedHex, basePath);
  const childKey = hdKey.deriveChild(index);

  const privateKeyBuffer = childKey.privateKey!;
  const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, {
    network: bitcoin.networks.bitcoin,
  });

  // Legacy P2PKH address (1...)
  const { address } = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: bitcoin.networks.bitcoin,
  });

  return address!;
}

// ─── Unified Derivation Entry Point ───

/**
 * Derive a deterministic address from mnemonic for a given network.
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Blockchain network name ("Ethereum", "Tron", "Bitcoin", etc.)
 * @param index - Account index (default 0)
 * @returns Deterministic address for the specified network
 */
export async function deriveAddressFromMnemonic(
  mnemonic: string,
  network: string,
  index: number = 0
): Promise<string> {
  switch (network) {
    case "Ethereum":
    case "ETH":
      return await deriveEthereumAddress(mnemonic, index);

    case "Tron":
    case "TRX":
      return await deriveTronAddress(mnemonic, index);

    case "Bitcoin":
    case "BTC":
      return await deriveBitcoinAddress(mnemonic, index);

    default:
      // For unknown/private networks, use Ethereum-style derivation as fallback
      return await deriveEthereumAddress(mnemonic, index);
  }
}

/**
 * Derive the private key for a given network and index.
 * Useful for signing transactions later.
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Blockchain network name
 * @param index - Account index (default 0)
 * @returns Private key as hex string
 */
export async function derivePrivateKeyFromMnemonic(
  mnemonic: string,
  network: string,
  index: number = 0
): Promise<string> {
  const seedHex = await mnemonicToSeed(mnemonic);
  const basePath = BIP44_PATHS[network] || BIP44_PATHS.Private;
  const hdKey = deriveHDKeyFromSeed(seedHex, basePath);
  const childKey = hdKey.deriveChild(index);
  return childKey.privateKey!.toString("hex").padStart(64, "0");
}
