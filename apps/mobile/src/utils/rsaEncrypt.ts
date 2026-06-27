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

/** RSA 公钥缓存（PEM 字符串），避免每次请求都重新获取 */
let cachedPublicKeyPem: string | null = null;

/**
 * 从服务端获取 RSA 公钥 PEM 字符串
 * 结果会被缓存，后续调用直接返回缓存值
 */
export async function fetchRsaPublicKey(): Promise<string> {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;

  console.log("[RSA] Fetching public key from server...");
  const { data } = await api.get("/rsa/public-key");
  const pem: string = data.public_key || data.publicKey;
  if (!pem) throw new Error("服务端未返回 RSA 公钥");
  console.log("[RSA] Public key fetched, length:", pem.length);
  cachedPublicKeyPem = pem;
  return pem;
}

/**
 * 用 RSA 公钥加密明文密码，返回 Base64 编码的密文
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
    cachedPublicKeyPem = null;
    console.error("[RSA] Encryption failed, cleared cache");
    throw new Error("RSA 加密失败，请重试");
  }

  console.log("[RSA] Password encrypted, ciphertext length:", encrypted.length);
  return encrypted;
}

/**
 * 清除 RSA 公钥缓存（例如服务端密钥更新时调用）
 */
export function clearRsaKeyCache(): void {
  cachedPublicKeyPem = null;
}