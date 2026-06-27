/**
 * 管理员认证缓存 — 验证成功后缓存加密密码，避免重复 RSA 加密
 *
 * 设计：
 * - 密码验证成功后，将 encryptedPassword 缓存到内存
 * - adminService 调用时优先使用缓存，无需每次重新加密
 * - 路由参数不再传递明文密码，只传 verified 标志
 * - 缓存有 TTL（10 分钟），过期后需重新验证
 */

import { encryptPassword, clearRsaKeyCache } from "./rsaEncrypt";

/** 缓存 TTL：10 分钟 */
const ADMIN_AUTH_CACHE_TTL = 10 * 60 * 1000;

let cachedEncryptedPassword: string | null = null;
let cachedPlaintextPassword: string | null = null;
let cacheTime: number = 0;

/** 判断缓存是否过期 */
function isCacheExpired(): boolean {
  return !cachedEncryptedPassword || (Date.now() - cacheTime) > ADMIN_AUTH_CACHE_TTL;
}

/**
 * 验证成功后缓存加密密码
 * @param plaintextPassword 明文密码
 */
export async function cacheAdminAuth(plaintextPassword: string): Promise<void> {
  const encrypted = await encryptPassword(plaintextPassword);
  cachedEncryptedPassword = encrypted;
  cachedPlaintextPassword = plaintextPassword;
  cacheTime = Date.now();
}

/**
 * 获取缓存的加密密码
 * 如果缓存过期或不存在，会用明文密码重新加密（如果提供了 plaintextPassword）
 * @param plaintextPassword 可选的明文密码 fallback
 * @returns 加密后的密码（Base64）
 */
export async function getEncryptedPassword(plaintextPassword?: string): Promise<string> {
  if (!isCacheExpired()) return cachedEncryptedPassword!;

  // 缓存过期，需要重新加密
  if (plaintextPassword) {
    return await encryptPassword(plaintextPassword);
  }

  // 既没有缓存也没有明文密码
  throw new Error("管理密码缓存已过期，请重新验证");
}

/**
 * 获取缓存的明文密码（仅用于路由跳转等本地场景，不涉及网络传输）
 * 如果缓存过期则返回 null
 */
export function getPlaintextPassword(): string | null {
  if (isCacheExpired()) return null;
  return cachedPlaintextPassword;
}

/**
 * 清除管理认证缓存
 */
export function clearAdminAuthCache(): void {
  cachedEncryptedPassword = null;
  cachedPlaintextPassword = null;
  cacheTime = 0;
}

/**
 * 判断管理认证缓存是否有效
 */
export function isAdminAuthCached(): boolean {
  return !isCacheExpired();
}
