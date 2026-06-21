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

  // 权限校验：设备关联的所有钱包 → 这些钱包下的所有链地址
  // 注意：地址级订阅是钱包级共享的（不按 device_id 去重），
  // 所以需要先查设备订阅的钱包，再查这些钱包下的地址。
  const deviceWalletSubs = await prisma.walletSubscription.findMany({
    where: { device_id: req.device!.deviceId },
    select: { wallet_id: true },
  });
  const walletIds = [...new Set(deviceWalletSubs.map((s: any) => s.wallet_id))];

  const addressSubs = await prisma.walletSubscription.findMany({
    where: { wallet_id: { in: walletIds }, address_id: { not: "" } },
    select: { address_id: true },
  });
  const addressIds = addressSubs.map((s: any) => s.address_id);

  const walletAddresses = await prisma.walletAddress.findMany({
    where: { id: { in: addressIds } },
    select: { address: true },
  });
  const myAddresses = new Set<string>();
  for (const wa of walletAddresses) myAddresses.add(wa.address);

  if (!myAddresses.has(tx.fromAddress) && !(tx.toAddress && myAddresses.has(tx.toAddress))) {
    res.status(403).json({ error: "You do not have permission to view this transaction" });
    return;
  }

  res.json(tx);
}));

export default router;