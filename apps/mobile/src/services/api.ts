import axios from "axios";
import * as SecureStore from "../utils/secureStorage";
import Constants from "expo-constants";
import "react-native-get-random-values";
import { getPublicKey, sign } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { etc } from "@noble/ed25519";

// Configure sha512 for @noble/ed25519 (required by v2+)
etc.sha512Sync = (...m: Uint8Array[]) => sha512(concatBytes(...m));

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

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
  async (error) => {
    // 当设备未注册时（数据库被清空等情况），清除本地标记
    // 使应用回到创建钱包引导页
    if (error.response?.status === 401) {
      const errorMsg = error.response?.data?.error;
      if (errorMsg === "Device not registered") {
        await SecureStore.deleteItemAsync(DEVICE_REGISTERED);
        await SecureStore.deleteItemAsync("aquad_has_wallets");
        await SecureStore.deleteItemAsync("aquad_is_backed_up");
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

/**
 * 启动时主动向服务端验证设备是否已注册。
 *
 * 解决场景：设备上安装了老版本 app，SecureStore 中残留了
 * DEVICE_REGISTERED="true" 标记，但服务端数据库是新的（为空），
 * 导致后续请求因 "设备未注册" 而失败。
 *
 * 流程：
 * 1. 若本地无密钥 → 返回 false（由后续请求拦截器自动生成密钥并注册）
 * 2. 若本地有密钥 → 调用 GET /devices/me 验证服务端是否存在该设备
 *    - 成功 → 设备已注册，返回 true
 *    - 401  → 服务端无此设备，清除本地标记后重新注册，返回 true
 *    - 其他错误（网络等）→ 假设设备可能已注册，返回 true 不阻塞
 */
export async function verifyAndReRegisterDevice(): Promise<boolean> {
  const keys = await ensureDeviceKeys();
  if (!keys) {
    // 无密钥对，后续请求拦截器会自动生成并注册
    return false;
  }

  try {
    // 通过 api 实例发送请求（拦截器会自动添加签名头）
    // 若服务端有此设备 → 200 OK
    await api.get("/devices/me");
    console.log("✅ 设备验证通过（服务端已注册）");
    return true;
  } catch (err: any) {
    if (err?.response?.status === 401) {
      // 服务端无此设备记录（新数据库等）
      // 响应拦截器已清除 DEVICE_REGISTERED，但为确保时序正确，显式清除一次
      await SecureStore.deleteItemAsync(DEVICE_REGISTERED);
      await SecureStore.deleteItemAsync("aquad_has_wallets");
      await SecureStore.deleteItemAsync("aquad_is_backed_up");

      console.log("🔄 设备在服务端不存在，正在重新注册...");

      // 直接调用注册接口（不走 api 拦截器，避免循环依赖）
      try {
        await axios.post(`${BASE_URL}/devices`, {
          device_id: keys.publicKeyHex,
          platform: "web",
          os: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 32) : "unknown",
          model: "Web Browser",
          locale: typeof navigator !== "undefined" ? navigator.language : "en",
          version: "1.0.0",
          currency: "CNY",
        });
        await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
        console.log("✅ 设备重新注册成功:", keys.publicKeyHex.slice(0, 8) + "...");
        return true;
      } catch (regErr: any) {
        // 设备已存在（幂等），也算成功
        if (regErr.response?.status === 409 || regErr.response?.status === 200) {
          await SecureStore.setItemAsync(DEVICE_REGISTERED, "true");
          console.log("✅ 设备已存在（幂等）");
          return true;
        }
        console.error("❌ 设备重新注册失败:", regErr.message);
        return false;
      }
    }

    // 网络错误等 — 不阻塞启动，后续请求会重试
    console.warn("⚠️ 设备验证请求失败（非401），不阻塞启动:", err.message);
    return true;
  }
}

export async function clearDeviceKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_PRIV_JWK);
  await SecureStore.deleteItemAsync(DEVICE_PUBLIC_KEY);
  await SecureStore.deleteItemAsync(DEVICE_REGISTERED);
}

export default api;