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
 * 从 app_configs 表读取配置值，不存在则回退到 config 文件默认值。
 */
async function getFeeConfigFromDB() {
  const [feeRateRecord, feeModeRecord] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "fee_rate" } }),
    prisma.appConfig.findUnique({ where: { key: "fee_mode" } }),
  ]);

  return {
    feeRate: feeRateRecord ? parseFloat(feeRateRecord.value) : config.fee.rate,
    feeMode: (feeModeRecord?.value as "EXTRA" | "DEDUCTED") || config.fee.mode,
  };
}

/**
 * GET /config/fee
 * Returns fee configuration. Reads from app_configs table first,
 * falls back to config file defaults if records don't exist.
 */
router.get("/fee", asyncHandler(async (_req: Request, res: Response) => {
  const feeConfig = await getFeeConfigFromDB();
  res.json(feeConfig);
}));

/**
 * POST /config/verify-password
 * Verifies the server config password against app_configs table (key=server_pwd).
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

/**
 * PUT /config/update
 * Generic update for app_configs dictionary.
 * Request body: { key: string, value: string }
 * Only allows updating existing keys (cannot create new keys).
 */
router.put("/update", asyncHandler(async (req: Request, res: Response) => {
  const { key, value } = req.body;

  if (!key || typeof key !== "string") {
    throw createError(400, "缺少配置键名", "KEY_REQUIRED");
  }
  if (value === undefined || value === null || typeof value !== "string") {
    throw createError(400, "缺少配置值", "VALUE_REQUIRED");
  }

  // Only allow updating existing keys
  const existing = await prisma.appConfig.findUnique({
    where: { key },
  });

  if (!existing) {
    throw createError(404, `配置项 "${key}" 不存在`, "CONFIG_KEY_NOT_FOUND");
  }

  // Validate fee_rate value if updating
  if (key === "fee_rate") {
    const numVal = parseFloat(value);
    if (isNaN(numVal) || numVal < 0 || numVal > 1) {
      throw createError(400, "费率必须在 0~1 之间", "INVALID_FEE_RATE");
    }
  }

  // Validate fee_mode value if updating
  if (key === "fee_mode" && !["EXTRA", "DEDUCTED"].includes(value)) {
    throw createError(400, "费率模式必须为 EXTRA 或 DEDUCTED", "INVALID_FEE_MODE");
  }

  // Validate tx_restrict_wallet value if updating
  if (key === "tx_restrict_wallet" && !["true", "false"].includes(value)) {
    throw createError(400, "交易限制开关必须为 true 或 false", "INVALID_TX_RESTRICT_VALUE");
  }

  const updated = await prisma.appConfig.update({
    where: { key },
    data: { value },
  });

  res.json({ key: updated.key, value: updated.value });
}));

/**
 * GET /config/all
 * Returns all app_configs entries as key-value pairs.
 * Used by ConfigManageScreen to read all configuration items.
 */
router.get("/all", asyncHandler(async (_req: Request, res: Response) => {
  const configs = await prisma.appConfig.findMany({
    orderBy: { key: "asc" },
  });
  res.json(configs.map((c) => ({ key: c.key, value: c.value })));
}));

export default router;