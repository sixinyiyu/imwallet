import { verifyAsync } from "@noble/ed25519";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { logger } from "../utils/logger";

/** 签名过期窗口：±5 分钟 */
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** Nonce 缓存：Map<nonce, timestamp>，5分钟过期 */
const nonceCache = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000;

/** 定期清理过期 nonce（每分钟） */
setInterval(() => {
  const now = Date.now();
  for (const [nonce, ts] of nonceCache) {
    if (now - ts > NONCE_TTL_MS) {
      nonceCache.delete(nonce);
    }
  }
}, 60 * 1000);

export interface DevicePayload {
  deviceId: string;   // 公钥 hex (64字符)
  dbId: number;       // devices 表自增 ID
  platform: string;
}

declare global {
  namespace Express {
    interface Request {
      device?: DevicePayload;
    }
  }
}

/**
 * 计算 body 的 SHA-256 hex hash。
 * 空 body 或无 body 返回空字符串。
 */
function computeBodyHash(body: any): string {
  if (!body || Object.keys(body).length === 0) return "";
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return createHash("sha256").update(bodyStr).digest("hex");
}

/**
 * 构造签名消息：timestamp + method + path + bodyHash
 */
export function buildSignMessage(
  timestamp: string,
  method: string,
  path: string,
  bodyHash: string
): string {
  return `${timestamp}${method}${path}${bodyHash}`;
}

/**
 * 设备签名验证中间件。
 *
 * 要求请求携带以下 headers：
 * - x-device-id: Ed25519 公钥 hex (64字符)
 * - x-signature: Ed25519 签名 hex (128字符)
 * - x-timestamp: Unix timestamp 秒
 * - x-nonce: 随机字符串（防重放）
 */
export async function deviceAuthMiddleware(
  req: any,
  res: any,
  next: any
): Promise<void> {
  const deviceId = req.headers["x-device-id"] as string;
  const signature = req.headers["x-signature"] as string;
  const timestampStr = req.headers["x-timestamp"] as string;
  const nonce = req.headers["x-nonce"] as string;

  // 1. 检查必要 headers
  if (!deviceId || !signature || !timestampStr || !nonce) {
    logger.warn("DEVICE_AUTH", `签名验证失败: 缺少必要 headers - ${req.method} ${req.originalUrl}`);
    res.status(401).json({ error: "Missing required auth headers (x-device-id, x-signature, x-timestamp, x-nonce)" });
    return;
  }

  // 2. 验证 device_id 格式（64字符 hex）
  if (!/^[0-9a-fA-F]{64}$/.test(deviceId)) {
    logger.warn("DEVICE_AUTH", `签名验证失败: device_id 格式无效 - ${deviceId.slice(0, 8)}...`);
    res.status(401).json({ error: "Invalid device_id format" });
    return;
  }

  // 3. 验证 timestamp 在 ±5 分钟内
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    res.status(401).json({ error: "Invalid timestamp" });
    return;
  }
  const now = Date.now();
  const diff = Math.abs(now - timestamp * 1000);
  if (diff > TIMESTAMP_WINDOW_MS) {
    logger.warn("DEVICE_AUTH", `签名验证失败: timestamp 过期 - diff=${diff}ms`);
    res.status(401).json({ error: "Request timestamp expired" });
    return;
  }

  // 4. 防重放：检查 nonce
  if (nonceCache.has(nonce)) {
    logger.warn("DEVICE_AUTH", `签名验证失败: nonce 重放 - nonce=${nonce.slice(0, 8)}...`);
    res.status(401).json({ error: "Replay detected" });
    return;
  }
  nonceCache.set(nonce, Date.now());

  // 5. 构造签名消息并验证（先验签名，再查设备）
  //    客户端使用 axios config.url（不含 /api/v1 前缀和 query string）作为签名路径，
  //    服务端需对 req.originalUrl 做同样处理以保持一致。
  const fullPath = req.originalUrl.split('?')[0]; // 去除 query string
  const API_PREFIX = '/api/v1';
  const signPath = fullPath.startsWith(API_PREFIX)
    ? fullPath.slice(API_PREFIX.length)
    : fullPath;
  const bodyHash = computeBodyHash(req.body);
  const message = buildSignMessage(timestampStr, req.method, signPath, bodyHash);

  try {
    const sigBytes = Buffer.from(signature, "hex");
    const msgBytes = new TextEncoder().encode(message);
    const pubKeyBytes = Buffer.from(deviceId, "hex");

    const valid = await verifyAsync(sigBytes, msgBytes, pubKeyBytes);

    if (!valid) {
      logger.warn("DEVICE_AUTH", `签名验证失败: 签名不匹配 - device_id=${deviceId.slice(0, 8)}...`);
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  } catch (err: any) {
    logger.warn("DEVICE_AUTH", `签名验证异常: ${err.message}`);
    res.status(401).json({ error: "Signature verification failed" });
    return;
  }

  // 6. 签名合法，查询设备是否已注册
  let device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });

  // 7. 设备不存在但签名合法 → 数据库被清空/重置，自动重建设备记录
  if (!device) {
    logger.info("DEVICE_AUTH", `设备未注册但签名合法，自动重建设备记录 - device_id=${deviceId.slice(0, 8)}...`);
    device = await prisma.device.create({
      data: {
        device_id: deviceId,
        platform: "android",
      },
    });
    logger.info("DEVICE_AUTH", `设备自动注册成功: id=${device.id}, device_id=${deviceId.slice(0, 8)}...`);
  }

  // 8. 设置 req.device
  req.device = {
    deviceId,
    dbId: device.id,
    platform: device.platform,
  };

  logger.info("DEVICE_AUTH", `设备认证成功: device_id=${deviceId.slice(0, 8)}...`);
  next();
}

/**
 * 可选的设备认证中间件：有签名则验证，无签名则跳过。
 * 用于某些既支持匿名访问又支持认证访问的接口。
 */
export async function optionalDeviceAuth(
  req: any,
  res: any,
  next: any
): Promise<void> {
  const deviceId = req.headers["x-device-id"] as string;
  if (!deviceId) {
    next();
    return;
  }
  return deviceAuthMiddleware(req, res, next);
}