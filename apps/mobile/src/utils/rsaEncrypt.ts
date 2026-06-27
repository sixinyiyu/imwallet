/**
 * RSA 加密工具 — 用于密码安全传输
 *
 * 流程：
 * 1. 从服务端 GET /rsa/public-key 获取 RSA 公钥 PEM
 * 2. 用 jsencrypt 库以公钥加密明文密码 → Base64 密文
 * 3. 将 encrypted_password 发送到后端
 * 4. 后端用 RSA 私钥解密后比对
 */

import JSEncrypt from "jsencrypt";
import api from "../services/api";

/** RSA 公钥缓存 TTL：10 分钟（毫秒） */
const RSA_KEY_CACHE_TTL = 10 * 60 * 1000;

/** RSA 公钥缓存 */
let cachedPublicKeyPem: string | null = null;
let cachedPublicKeyTime: number = 0;

/** 判断缓存是否过期 */
function isCacheExpired(): boolean {
  return !cachedPublicKeyPem || (Date.now() - cachedPublicKeyTime) > RSA_KEY_CACHE_TTL;
}

/**
 * 从服务端获取 RSA 公钥 PEM 字符串
 * 结果会被缓存 10 分钟，过期后自动重新获取
 */
export async function fetchRsaPublicKey(): Promise<string> {
  if (!isCacheExpired()) return cachedPublicKeyPem!;

  const { data } = await api.get("/rsa/public-key");
  const pem: string = data.public_key || data.publicKey;
  if (!pem) throw new Error("服务端未返回 RSA 公钥");
  cachedPublicKeyPem = pem;
  cachedPublicKeyTime = Date.now();
  return pem;
}

/**
 * 用 RSA 公钥加密明文密码，返回 Base64 编码的密文
 * 加密失败时自动清除缓存，方便下次重试
 *
 * @param plaintextPassword 明文密码
 * @returns Base64 编码的 RSA 加密密文
 */
export async function encryptPassword(plaintextPassword: string): Promise<string> {
  const publicKeyPem = await fetchRsaPublicKey();

  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKeyPem);

  const encrypted = encrypt.encrypt(plaintextPassword);
  if (!encrypted) {
    // 加密失败时清除缓存，下次重新获取公钥
    clearRsaKeyCache();
    throw new Error("RSA 加密失败，请重试");
  }

  return encrypted;
}

/**
 * 清除 RSA 公钥缓存（服务端密钥更新、加密失败等场景）
 */
export function clearRsaKeyCache(): void {
  cachedPublicKeyPem = null;
  cachedPublicKeyTime = 0;
}
