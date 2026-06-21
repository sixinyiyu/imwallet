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

  // 权限校验：验证设备是否关联该钱包
  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: req.device!.deviceId,
    },
  });
  if (!subscription) {
    // 兜底：钱包存在即允许（刚创建还没添加网络账户）
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
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
  const tokenSymbol = req.query.tokenSymbol as string | undefined;

  const result = await transactionService.getTransactions({
    walletId,
    page,
    limit,
    type: (type === "send" || type === "receive") ? type : undefined,
    timeRange: (["today", "7d", "30d", "90d"].includes(timeRange || "")) ? timeRange as any : undefined,
    search: search || undefined,
    tokenSymbol: tokenSymbol || undefined,
  });
  res.json(result);
}));

/**
 * GET /transactions/check-address?address=xxx
 * 查询地址是否在系统中（contacts 在客户端，不再查询）
 */
router.get("/check-address", asyncHandler(async (req: Request, res: Response) => {
  const address = (req.query.address as string || "").trim();
  if (!address) {
    res.status(400).json({ error: "address 参数不能为空" });
    return;
  }

  // 查系统内：wallets_addresses 表（所有链地址）
  const walletAddress = await prisma.walletAddress.findFirst({ where: { address } });
  const inSystem = !!walletAddress;

  // contacts 在客户端，inContacts 始终返回 false
  res.json({ inSystem, inContacts: false });
}));

router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const txId = req.params.id as string;
  const tx = await transactionService.getTransactionDetail(txId);
  res.json(tx);
}));

export default router;