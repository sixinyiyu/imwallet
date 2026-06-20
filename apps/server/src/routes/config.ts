import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { config } from "../config";
import { createError } from "../middleware/errorHandler";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

/**
 * GET /config/fee
 * Returns fee configuration for client-side calculation.
 */
router.get("/fee", asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    feeRate: config.fee.rate,
    feeMode: config.fee.mode,
  });
}));

/**
 * POST /config/verify-password
 * Verifies the server config password against app_configs table (key=server_pwd).
 * Used by the app to gate access to service configuration.
 */
router.post("/verify-password", asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;

  if (!password || typeof password !== "string") {
    throw createError(400, "请输入密码", "PASSWORD_REQUIRED");
  }

  const record = await prisma.appConfig.findUnique({
    where: { key: "server_pwd" },
  });

  if (!record || record.value !== password) {
    throw createError(403, "密码错误", "PASSWORD_INCORRECT");
  }

  res.json({ verified: true });
}));

export default router;
