import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { adminMiddleware } from "../middleware/auth";
import * as adminService from "../services/adminService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// 所有管理员路由需要设备签名验证 + Admin 表验证
router.use(deviceAuthMiddleware);
router.use(adminMiddleware);

/** GET /devices - 获取所有设备列表 */
router.get(
  "/devices",
  asyncHandler(async (req: Request, res: Response) => {
    const devices = await adminService.getAllDevices();
    res.json({ devices });
  })
);

/** GET /wallets - 获取所有钱包列表 */
router.get(
  "/wallets",
  asyncHandler(async (req: Request, res: Response) => {
    const wallets = await adminService.getAllWallets();
    res.json({ wallets });
  })
);

/** GET /subscriptions - 获取所有钱包-设备订阅关系 */
router.get(
  "/subscriptions",
  asyncHandler(async (req: Request, res: Response) => {
    const subs = await adminService.getAllSubscriptions();
    res.json({ subscriptions: subs });
  })
);

/** GET /transactions - 获取所有交易记录 */
router.get(
  "/transactions",
  asyncHandler(async (req: Request, res: Response) => {
    const txs = await adminService.getAllTransactions();
    res.json({ transactions: txs });
  })
);

export default router;
