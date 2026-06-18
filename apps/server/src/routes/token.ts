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

// 权限校验辅助函数：验证设备是否关联该钱包
async function checkWalletPermission(walletId: string, deviceId: string): Promise<boolean> {
  const subscription = await prisma.walletSubscription.findFirst({
    where: { wallet_id: walletId, device: { device_id: deviceId } },
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

export default router;