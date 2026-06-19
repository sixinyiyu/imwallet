import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate";
import { z } from "zod";
import prisma from "../config/prisma";
import { logger } from "../utils/logger";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// ===== 上传日志（无需设备签名，崩溃时可能设备未注册） =====

const uploadLogSchema = z.object({
  device_id: z.string().max(64).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  version: z.string().max(32).optional(),
  log_type: z.enum(["crash", "business"], { required_error: "log_type is required" }),
  content: z.string().max(10000, "content too long").min(1, "content is required"),
});

router.post(
  "/",
  validate(uploadLogSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { device_id, platform, version, log_type, content } = req.body;

    await prisma.appLog.create({
      data: {
        device_id: device_id || null,
        platform: platform || null,
        version: version || null,
        log_type,
        content,
      },
    });

    logger.info("APP_LOG", `Received ${log_type} log from ${platform || "unknown"} v${version || "?"}: ${content.slice(0, 100)}`);
    res.status(201).json({ success: true });
  })
);

export default router;