import axios from "axios";
import { Platform } from "react-native";
import * as SecureStore from "../utils/secureStorage";
import Constants from "expo-constants";
import "react-native-get-random-values";
import * as ed25519 from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

// ===== Configure SHA-512 for @noble/ed25519 v3 =====
// v3 requires hashes.sha512 to be set before calling sync methods (getPublicKey, sign, etc.)
// v3's `etc` is Object.freeze() — CANNOT modify it (would crash with TypeError in strict mode)
// v3's `hashes` is a plain object — CAN be modified
ed25519.hashes.sha512 = sha512;

const DEVICE_PRIV_JWK = "imwallet_device_priv_jwk";
const DEVICE_PUB_JWK = "imwallet_device_pub_jwk";
const DEVICE_PUBLIC_KEY = "imwallet_device_public_key";
const DEVICE_REGISTERED = "imwallet_device_registered";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://imwallet.dpdns.org/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ===== 工具函数 =====

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function computeBodyHash(body: any): Promise<string> {
  if (!body || Object.keys(body).length === 0) return "";
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const data = new TextEncoder().encode(bodyStr);
  const hash = sha256(data);
  return bytesToHex(hash);
}

function buildSignMessage(
  timestamp: string,
  method: string,
  path: string,
  bodyHash: string
): string {
  return `${timestamp}${method}${path}${bodyHash}`;
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  // react-native-get-randomValues polyfill makes crypto.getRandomValues available
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

// ===== Ed25519 密钥操作（@noble/ed25519 v3，纯 JS，跨平台兼容） =====

async function generateKeyPair(): Promise<{
  publicKeyHex: string;
  privateKeyHex: string;
}> {
  // v3: use keygen() which generates a random secret key + derives public key
  // keygen() requires hashes.sha512 to be configured (done above)
  const { secretKey, publicKey } = ed25519.keygen();
  return {
    publicKeyHex: bytesToHex(publicKey),
    privateKeyHex: bytesToHex(secretKey),
  };
}

async function signMessage(message: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(message);
  const privateKey = hexToBytes(privateKeyHex);
  // v3: sign() is sync, requires hashes.sha512 configured
  const signature = ed25519.sign(msgBytes, privateKey);
  return bytesToHex(signature);
}

// ===== 设备管理 =====

export async function ensureDeviceKeys(): Promise<{ publicKeyHex: string; privateKeyHex: string } | null> {
  let publicKeyHex = await SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
  let privateKeyHex = await SecureStore.getItemAsync(DEVICE_PRIV_JWK);

  if (publicKeyHex && privateKeyHex) {
    return { publicKeyHex, privateKeyHex };
  }

  try {
    const keys = await generateKeyPair();
    await SecureStore.setItemAsync(DEVICE_PRIV_JWK, keys.privateKeyHex);
    await SecureStore.setItemAsync(DEVICE_PUBLIC_KEY, keys.publicKeyHex);
    return { publicKeyHex: keys.publicKeyHex, privateKeyHex: keys.privateKeyHex };
  } catch (err) {
    return null;
  }
}

export async function ensureDeviceRegistered(publicKeyHex: string): Promise<void> {
  const registered = await SecureStore.getItemAsync(DEVICE_REGISTERED);
  if (registered === "true") return;

  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  try {
    await axios.post(`${BASE_URL}/devices`, {
      device_id: publicKeyHex,
      platform,
    });
    await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
  } catch (err: any) {
    if (err.response?.status === 409) {
      await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
    }
  }
}

// ===== 拦截器 =====

api.interceptors.request.use(async (config) => {
  // 设备密钥和注册已在 walletStore.loadLocalState 中显式初始化
  // 拦截器只负责签名，不再隐式初始化设备
  const publicKeyHex = await SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
  const privateKeyHex = await SecureStore.getItemAsync(DEVICE_PRIV_JWK);
  if (!publicKeyHex || !privateKeyHex) return config;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  const method = (config.method || "GET").toUpperCase();
  const path = config.url || "/";
  const bodyHash = await computeBodyHash(config.data);

  const message = buildSignMessage(timestamp, method, path, bodyHash);
  const signature = await signMessage(message, privateKeyHex);

  config.headers["x-device-id"] = publicKeyHex;
  config.headers["x-signature"] = signature;
  config.headers["x-timestamp"] = timestamp;
  config.headers["x-nonce"] = nonce;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 当设备未注册时（数据库被清空等情况），清除本地标记
    // 使应用回到创建钱包引导页
    if (error.response?.status === 401) {
      const errorMsg = error.response?.data?.error;
      if (errorMsg === "Device not registered") {
        SecureStore.deleteItemAsync(DEVICE_REGISTERED);
        // Note: per-wallet backup flags (aquad_backed_up_{walletId}) are cleared
        // when walletStore resets its backedUpWallets Set on 401
      }
    }
    return Promise.reject(error);
  }
);

// ===== 导出 =====

export async function getDevicePublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
}

export async function isDeviceRegistered(): Promise<boolean> {
  return (await SecureStore.getItemAsync(DEVICE_REGISTERED)) === "true";
}


export default api;