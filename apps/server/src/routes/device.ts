import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as deviceService from "../services/deviceService";
import { z } from "zod";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// ===== 设备注册（无需签名，首次启动） =====
// 精简：只接收 device_id + platform

const registerDeviceSchema = z.object({
  device_id: z.string().regex(/^[0-9a-fA-F]{64}$/, "device_id must be 64-char hex (Ed25519 public key)"),
  platform: z.enum(["ios", "android", "web"], { required_error: "platform is required" }),
});

router.post(
  "/",
  validate(registerDeviceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await deviceService.registerDevice(req.body);
    // 新设备返回 201，已存在设备返回 200（幂等）
    const status = result.created_at.getTime() === result.updated_at.getTime() ? 201 : 200;
    res.status(status).json(result);
  })
);

// ===== 获取当前设备信息（需要签名） =====

router.get(
  "/me",
  deviceAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const deviceId = req.headers["x-device-id"] as string;
    const result = await deviceService.getDevice(deviceId);
    res.json(result);
  })
);

// ===== 设备订阅钱包（需要签名） =====

const subscribeWalletSchema = z.object({
  wallet_id: z.string().min(1, "wallet_id is required"),
  chain: z.string().max(32).optional(),
  address_id: z.string().max(36).optional(),
});

router.post(
  "/wallets",
  deviceAuthMiddleware,
  validate(subscribeWalletSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const deviceId = req.headers["x-device-id"] as string;
    const result = await deviceService.subscribeWallet(
      deviceId,
      req.body.wallet_id,
      req.body.chain,
      req.body.address_id
    );
    res.status(201).json(result);
  })
);

// ===== 设备取消订阅钱包（需要签名） =====

router.delete(
  "/wallets/:wallet_id",
  deviceAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const deviceId = req.headers["x-device-id"] as string;
    await deviceService.unsubscribeWallet(deviceId, req.params.wallet_id as string);
    res.status(204).send();
  })
);

// ===== 获取设备订阅的所有钱包（需要签名） =====

router.get(
  "/wallets",
  deviceAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const deviceId = req.headers["x-device-id"] as string;
    const result = await deviceService.getDeviceWallets(deviceId);
    res.json({ wallets: result });
  })
);

export default router;
