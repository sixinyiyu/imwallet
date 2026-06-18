import axios from "axios";
import * as SecureStore from "../utils/secureStorage";
import Constants from "expo-constants";
import "react-native-get-random-values";
import { getPublicKey, sign } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";

const DEVICE_PRIV_JWK = "imwallet_device_priv_jwk";
const DEVICE_PUB_JWK = "imwallet_device_pub_jwk";
const DEVICE_PUBLIC_KEY = "imwallet_device_public_key";
const DEVICE_REGISTERED = "imwallet_device_registered";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://imwallet.dpdns.org/api/v1";

console.log("🔗 API_BASE_URL:", BASE_URL);

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

// ===== Ed25519 密钥操作（@noble/ed25519，纯 JS，跨平台兼容） =====

async function generateKeyPair(): Promise<{
  publicKeyHex: string;
  privateKeyHex: string;
}> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = await getPublicKey(privateKey);
  return {
    publicKeyHex: bytesToHex(publicKey),
    privateKeyHex: bytesToHex(privateKey),
  };
}

async function signMessage(message: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(message);
  const privateKey = hexToBytes(privateKeyHex);
  const signature = await sign(msgBytes, privateKey);
  return bytesToHex(signature);
}

// ===== 设备管理 =====

async function ensureDeviceKeys(): Promise<{ publicKeyHex: string; privateKeyHex: string } | null> {
  let publicKeyHex = await SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
  let privateKeyHex = await SecureStore.getItemAsync(DEVICE_PRIV_JWK);

  if (publicKeyHex && privateKeyHex) {
    return { publicKeyHex, privateKeyHex };
  }

  try {
    const keys = await generateKeyPair();
    await SecureStore.setItemAsync(DEVICE_PRIV_JWK, keys.privateKeyHex);
    await SecureStore.setItemAsync(DEVICE_PUBLIC_KEY, keys.publicKeyHex);
    console.log("🔑 设备密钥对已生成:", keys.publicKeyHex.slice(0, 8) + "...");
    return { publicKeyHex: keys.publicKeyHex, privateKeyHex: keys.privateKeyHex };
  } catch (err) {
    console.error("❌ 生成设备密钥对失败:", err);
    return null;
  }
}

async function ensureDeviceRegistered(publicKeyHex: string): Promise<void> {
  const registered = await SecureStore.getItemAsync(DEVICE_REGISTERED);
  if (registered === "true") return;

  try {
    await axios.post(`${BASE_URL}/devices`, {
      device_id: publicKeyHex,
      platform: "web",
      os: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 32) : "unknown",
      model: "Web Browser",
      locale: typeof navigator !== "undefined" ? navigator.language : "en",
      version: "1.0.0",
      currency: "CNY",
    });
    await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
    console.log("✅ 设备已注册:", publicKeyHex.slice(0, 8) + "...");
  } catch (err: any) {
    if (err.response?.status === 409) {
      await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
    } else {
      console.error("❌ 设备注册失败:", err.message);
    }
  }
}

// ===== 拦截器 =====

api.interceptors.request.use(async (config) => {
  const keys = await ensureDeviceKeys();
  if (!keys) return config;

  await ensureDeviceRegistered(keys.publicKeyHex);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  const method = (config.method || "GET").toUpperCase();
  const path = config.url || "/";
  const bodyHash = await computeBodyHash(config.data);

  const message = buildSignMessage(timestamp, method, path, bodyHash);
  const signature = await signMessage(message, keys.privateKeyHex);

  config.headers["x-device-id"] = keys.publicKeyHex;
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
        SecureStore.deleteItemAsync("aquad_has_wallets");
        SecureStore.deleteItemAsync("aquad_is_backed_up");
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

export async function clearDeviceKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_PRIV_JWK);
  await SecureStore.deleteItemAsync(DEVICE_PUBLIC_KEY);
  await SecureStore.deleteItemAsync(DEVICE_REGISTERED);
}

export default api;