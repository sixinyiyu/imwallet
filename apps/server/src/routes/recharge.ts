import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import { rechargeSchema } from "../validators/recharge";
import * as rechargeService from "../services/rechargeService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

/**
 * POST /recharges — 对系统内钱包充值代币
 * 仅 recharge_allowed_devices 配置中的设备可操作。
 */
router.post(
  "/",
  validate(rechargeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await rechargeService.recharge(req.body, {
      deviceId: req.device!.deviceId,
      platform: req.device!.platform,
      version: "",
    });
    res.status(201).json(result);
  })
);

/**
 * GET /recharges — 查询充值记录列表（分页）
 * 可选参数: walletId, tokenSymbol, page, limit
 */
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);
  const walletId = (req.query.walletId as string) || undefined;
  const tokenSymbol = (req.query.tokenSymbol as string) || undefined;

  const result = await rechargeService.getRecharges({ page, limit, walletId, tokenSymbol });
  res.json(result);
}));

export default router;