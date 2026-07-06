/**
 * 管理员认证缓存 — 验证成功后缓存加密密码，避免重复 RSA 加密
 *
 * 设计：
 * - 密码验证成功后，将 encryptedPassword 缓存到内存
 * - adminService 调用时优先使用缓存，无需每次重新加密
 * - 路由参数不再传递明文密码，只传 verified 标志
 * - 缓存有 TTL（10 分钟），过期后需重新验证
 *
 * 路由前缀缓存：
 * - 反馈匹配后，AES-256-GCM 解密得到的管理路由前缀缓存到 SecureStore
 * - adminService 调用时从缓存读取前缀，动态拼接 API 路径
 * - 后端更换前缀后，前端下次反馈匹配自动获取新前缀，无需重新打包 App
 */

import { encryptPassword } from "./rsaEncrypt";import * as SecureStore from "./secureStorage";

/** 缓存 TTL：10 分钟 */
const ADMIN_AUTH_CACHE_TTL = 10 * 60 * 1000;

/** SecureStore key：管理路由前缀 */
const ADMIN_ROUTE_PREFIX_KEY = "aquad_admin_route_prefix";

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
  // 注意：不清除路由前缀！路由前缀是反馈验证时获取的，与密码缓存生命周期无关
  // 密码过期只需重新验证密码，路由前缀应持久保留
}

/**
 * 判断管理认证缓存是否有效
 */
export function isAdminAuthCached(): boolean {
  return !isCacheExpired();
}

// ── 路由前缀缓存 ──

/**
 * 缓存管理路由前缀（如 "vault"）到 SecureStore
 * 反馈匹配后 AES 解密得到的前缀，持久化存储
 * 后端更换前缀后，前端下次反馈匹配自动获取新值
 */
export async function cacheAdminRoutePrefix(prefix: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ADMIN_ROUTE_PREFIX_KEY, prefix);
  } catch { /* silent */ }
}

/**
 * 获取缓存的管理路由前缀
 * @returns 前缀字符串（如 "vault"），未缓存时返回 null
 */
export async function getAdminRoutePrefix(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ADMIN_ROUTE_PREFIX_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * 清除管理路由前缀缓存
 */
export async function clearAdminRoutePrefix(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ADMIN_ROUTE_PREFIX_KEY);
  } catch { /* silent */ }
}