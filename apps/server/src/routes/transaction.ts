import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import { transferSchema } from "../validators/transaction";
import * as transactionService from "../services/transactionService";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

router.post(
  "/transfer",
  validate(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tx = await transactionService.transfer(req.body, req.device!.deviceId);
    res.status(201).json(tx);
  })
);

router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.query.walletId as string;
  if (!walletId) {
    res.status(400).json({ error: "walletId query parameter is required" });
    return;
  }

  // 权限校验：验证设备是否关联该钱包（手动查找设备，不使用 relation filter）
  const device = await prisma.device.findUnique({
    where: { device_id: req.device!.deviceId },
  });
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: device.id,
    },
  });
  if (!subscription) {
    res.status(403).json({ error: "You do not have permission to view this wallet's transactions" });
    return;
  }

  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 100);

  // Parse filter params
  const type = req.query.type as string | undefined;
  const timeRange = req.query.timeRange as string | undefined;
  const search = req.query.search as string | undefined;

  const result = await transactionService.getTransactions({
    walletId,
    page,
    limit,
    type: (type === "send" || type === "receive") ? type : undefined,
    timeRange: (["today", "7d", "30d", "90d"].includes(timeRange || "")) ? timeRange as any : undefined,
    search: search || undefined,
  });
  res.json(result);
}));

router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const txId = req.params.id as string;
  const tx = await transactionService.getTransactionDetail(txId);

  // 权限校验：验证设备是否关联该交易的钱包（手动查找设备，不使用 relation filter）
  const device = await prisma.device.findUnique({
    where: { device_id: req.device!.deviceId },
  });
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const deviceSubs = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    select: { wallet_id: true },
  });
  const myWalletIds = deviceSubs.map((s: any) => s.wallet_id);
  if (!myWalletIds.includes(tx.fromWalletId) && !(tx.toWalletId && myWalletIds.includes(tx.toWalletId))) {
    res.status(403).json({ error: "You do not have permission to view this transaction" });
    return;
  }

  res.json(tx);
}));

export default router;
