import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as tokenService from "../services/tokenService";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

// GET / — list all active tokens
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const tokens = await tokenService.getAllTokens();
  res.json({ tokens });
}));

// 权限校验辅助函数：验证设备是否关联该钱包（手动查找设备，不使用 relation filter）
async function checkWalletPermission(walletId: string, deviceId: string): Promise<boolean> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) return false;

  const subscription = await prisma.walletSubscription.findFirst({
    where: { wallet_id: walletId, device_id: device.id },
  });
  return !!subscription;
}

router.get("/:walletId/balance", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.walletId as string;
  const hasPermission = await checkWalletPermission(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }
  const result = await tokenService.getWalletBalance(walletId);
  res.json(result);
}));

router.get("/:walletId/list", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.walletId as string;
  const hasPermission = await checkWalletPermission(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }
  const tokens = await tokenService.getTokenBalances(walletId);
  res.json({ tokens });
}));

/**
 * PUT /tokens/:id/tradable — 切换代币交易开关
 * Request body: { isTradable: boolean }
 */
router.put("/:id/tradable", asyncHandler(async (req: Request, res: Response) => {
  const tokenId = req.params.id as string;
  const { isTradable } = req.body;
  if (typeof isTradable !== "boolean") {
    res.status(400).json({ error: "isTradable 必须为布尔值" });
    return;
  }
  const result = await tokenService.updateTokenTradable(tokenId, isTradable);
  res.json(result);
}));

export default router;