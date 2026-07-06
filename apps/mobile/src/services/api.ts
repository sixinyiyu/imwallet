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

// ===== snake_case ↔ camelCase 自动转换 =====
// Rust 后端使用 snake_case，前端使用 camelCase。
// 在 API 边界自动转换，避免逐个手动改字段名。

/** camelCase → snake_case */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** snake_case → camelCase */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/** 递归转换对象的所有 key */
function transformKeys(obj: any, transformer: (key: string) => string): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj; // 保留 Date 对象
  if (Array.isArray(obj)) return obj.map((item) => transformKeys(item, transformer));
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[transformer(key)] = transformKeys(value, transformer);
    }
    return result;
  }
  return obj;
}

// 请求拦截器：发送前 camelCase → snake_case（合并到签名拦截器中，确保先转换再签名）
// 不单独注册，避免执行顺序问题导致签名不匹配

// 响应拦截器：接收后 snake_case → camelCase
api.interceptors.response.use((response) => {
  if (response.data && typeof response.data === "object") {
    response.data = transformKeys(response.data, toCamelCase);
  }
  return response;
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
  nonce: string,
  bodyHash: string
): string {
  return `${timestamp}${method}${path}${nonce}${bodyHash}`;
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
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } }).response?.status === 409) {
      await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
    }
  }
}

// ===== 拦截器 =====

api.interceptors.request.use(async (config) => {
  // 1. 先将请求 body/params 转为 snake_case（必须在签名之前）
  if (config.data && typeof config.data === "object") {
    config.data = transformKeys(config.data, toSnakeCase);
  }
  if (config.params && typeof config.params === "object") {
    config.params = transformKeys(config.params, toSnakeCase);
  }

  // 2. 签名（基于已转换的 snake_case body）
  const publicKeyHex = await SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
  const privateKeyHex = await SecureStore.getItemAsync(DEVICE_PRIV_JWK);
  if (!publicKeyHex || !privateKeyHex) return config;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  const method = (config.method || "GET").toUpperCase();
  const path = config.url || "/";
  const bodyHash = await computeBodyHash(config.data);

  const message = buildSignMessage(timestamp, method, path, nonce, bodyHash);
  const signature = await signMessage(message, privateKeyHex);

  config.headers["x-device-id"] = publicKeyHex;
  config.headers["x-signature"] = signature;
  config.headers["x-timestamp"] = timestamp;
  config.headers["x-nonce"] = nonce;
  config.headers["x-platform"] = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

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