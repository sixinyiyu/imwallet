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

  // 权限校验：管理员可查看所有钱包交易，普通设备需验证关联
  if (!req.device!.isAdmin) {
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to view this wallet's transactions" });
      return;
    }
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

  // 权限校验：管理员可查看任意交易，普通设备需验证关联
  if (!req.device!.isAdmin) {
    const deviceSubs = await prisma.walletSubscription.findMany({
      where: { device: { device_id: req.device!.deviceId } },
      select: { wallet_id: true },
    });
    const myWalletIds = deviceSubs.map((s: any) => s.wallet_id);
    if (!myWalletIds.includes(tx.fromWalletId) && !myWalletIds.includes(tx.toWalletId)) {
      res.status(403).json({ error: "You do not have permission to view this transaction" });
      return;
    }
  }

  res.json(tx);
}));

export default router;
