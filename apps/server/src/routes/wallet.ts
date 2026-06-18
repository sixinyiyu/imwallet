import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import {
  walletSchema,
  resetPasswordSchema,
} from "../validators/wallet";
import * as walletService from "../services/walletService";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// 所有钱包操作需要设备签名验证
router.use(deviceAuthMiddleware);

// 获取当前设备的钱包列表
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const wallets = await walletService.getDeviceWallets(req.device!.deviceId);
  res.json({ wallets });
}));

// 创建/导入钱包（统一接口，通过 source 字段区分）
router.post(
  "/",
  validate(walletSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const wallet = await walletService.createOrImportWallet(
      req.device!.deviceId,
      req.body.source,
      req.body.alias,
      req.body.password,
      req.body.passwordHint,
      req.body.mnemonic,
      req.body.privateKey
    );
    res.status(201).json(wallet);
  })
);

// 重置钱包密码（通过助记词验证身份后更新密码）
router.put(
  "/:id/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.id as string;

    // 验证设备与钱包关联
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to reset this wallet password" });
      return;
    }

    const wallet = await walletService.resetWalletPassword(
      walletId,
      req.body.mnemonic,
      req.body.password,
      req.body.passwordHint
    );
    res.json(wallet);
  })
);

// 获取钱包详情（需验证设备与钱包关联）
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;

  // Verify device-wallet ownership
  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device: { device_id: req.device!.deviceId },
    },
  });
  if (!subscription) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }

  const wallet = await walletService.getWalletDetail(walletId, req.device!.deviceId);
  res.json(wallet);
}));

// 删除钱包（取消当前设备的订阅）
router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
  await walletService.deleteWallet(req.params.id as string, req.device!.deviceId);
  res.status(204).send();
}));

// 更新钱包别名
router.put("/:id", asyncHandler(async (req: Request, res: Response) => {
  const walletId = req.params.id as string;
  const { alias } = req.body;
  if (!alias || typeof alias !== "string") {
    res.status(400).json({ error: "alias is required" });
    return;
  }

  // 验证设备与钱包关联
  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device: { device_id: req.device!.deviceId },
    },
  });
  if (!subscription) {
    res.status(403).json({ error: "You do not have permission to update this wallet" });
    return;
  }

  const wallet = await walletService.updateWalletAlias(walletId, alias);
  res.json(wallet);
}));

// 验证钱包密码
router.post(
  "/:id/verify-password",
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.id as string;
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "password is required" });
      return;
    }

    // 验证设备与钱包关联
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to verify this wallet" });
      return;
    }

    const verified = await walletService.verifyWalletPassword(walletId, password);
    res.json({ verified });
  })
);

export default router;