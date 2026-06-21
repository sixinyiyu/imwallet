import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import { walletSchema, walletAddressSchema } from "../validators/wallet";
import * as walletService from "../services/walletService";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// 所有钱包操作需要设备签名验证
router.use(deviceAuthMiddleware);

/**
 * Helper: 验证设备是否关联该钱包
 * 先查地址级订阅，没有则兜底查 wallets 表（刚创建还没添加账户的情况）
 */
async function checkWalletOwnership(walletId: string, _deviceId: string): Promise<boolean> {
  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: _deviceId,
    },
  });
  if (subscription) return true;

  // 兜底：钱包存在即允许（刚创建还没添加网络账户）
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  return !!wallet;
}

// 获取当前设备的钱包列表（简化数据，不含代币余额）
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const wallets = await walletService.getDeviceWallets(req.device!.deviceId);
  res.json({ wallets });
}));

// 获取钱包列表聚合数据（含网络列表，供钱包列表页使用）
router.get("/aggregate", asyncHandler(async (req: Request, res: Response) => {
  const wallets = await walletService.getDeviceWalletsAggregate(req.device!.deviceId);
  res.json({ wallets });
}));

// 获取所有系统钱包（搜索+分页，供充值管理等场景使用）
router.get("/all", asyncHandler(async (req: Request, res: Response) => {
  const search = (req.query.search as string) || undefined;
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);
  const result = await walletService.getAllWallets({ search, page, limit });
  res.json(result);
}));

// 创建/导入钱包（精简：服务端只创建 { id, source }，walletId 由客户端生成）
router.post(
  "/",
  validate(walletSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const wallet = await walletService.createOrImportWallet(
      req.device!.deviceId,
      req.body.walletId,
      req.body.alias || "",
      req.body.source
    );
    res.status(201).json(wallet);
  })
);

// 获取钱包详情（需验证设备与钱包关联）
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;

  const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }

  const wallet = await walletService.getWalletDetail(walletId, req.device!.deviceId);
  res.json(wallet);
}));

// 获取钱包余额详情（总余额+各代币余额，切换钱包时使用）
router.get("/:id/balance", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;

  const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }

  const balanceDetail = await walletService.getWalletBalanceDetail(walletId);
  res.json(balanceDetail);
}));

// 删除钱包（取消当前设备的订阅）
router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
  await walletService.deleteWallet(req.params.id as string, req.device!.deviceId);
  res.status(204).send();
}));

// ─── Wallet Addresses 路由 ──────────────────────────────────────────────────

// 同步地址到服务端（客户端创建账户后调用）
router.post(
  "/:id/addresses",
  validate(walletAddressSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.id as string;

    const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
    if (!hasPermission) {
      res.status(403).json({ error: "You do not have permission to access this wallet" });
      return;
    }

    const result = await walletService.addWalletAddress(
      walletId,
      req.device!.deviceId,
      req.body.chain,
      req.body.address
    );
    res.status(201).json(result);
  })
);

// 删除服务端地址记录（客户端删除账户时同步调用）
router.delete("/:id/addresses/:addressId", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;
  const addressId = req.params.addressId as string;

  const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to access this wallet" });
    return;
  }

  await walletService.deleteWalletAddress(walletId, req.device!.deviceId, addressId);
  res.status(204).send();
}));

// 查询钱包的所有链上地址（服务端视角）
router.get("/:id/addresses", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;

  const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to access this wallet" });
    return;
  }

  const addresses = await walletService.getWalletAddresses(walletId);
  res.json({ addresses });
}));

export default router;