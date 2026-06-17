import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { deviceAuthMiddleware, DevicePayload } from "./deviceAuth";
import { createError } from "./errorHandler";
import { logger } from "../utils/logger";

/**
 * 管理员权限中间件。
 * 依赖 deviceAuthMiddleware 已验证设备签名，
 * 额外检查设备是否在 Admin 表中。
 *
 * 使用方式：router.use(deviceAuthMiddleware, adminMiddleware)
 */
export async function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.device) {
    res.status(401).json({ error: "Device authentication required" });
    return;
  }

  if (!req.device.isAdmin) {
    logger.warn("ADMIN", `非管理员访问: device_id=${req.device.deviceId.slice(0, 8)}...`);
    res.status(403).json({ error: "Insufficient permissions", code: "INSUFFICIENT_PERMISSIONS" });
    return;
  }

  next();
}

// Re-export deviceAuthMiddleware for convenience
export { deviceAuthMiddleware };
