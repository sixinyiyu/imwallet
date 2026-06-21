import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as accountService from "../services/accountService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

/**
 * GET /wallets/networks/batch — Batch get account networks for multiple wallets
 * Returns deduplicated network list per wallet, for lightweight UI display
 * Uses wallets_addresses table (replaces old accounts table)
 */
router.get(
  "/wallets/networks/batch",
  asyncHandler(async (req: Request, res: Response) => {
    const walletIds = (req.query.walletIds as string || "").split(",").filter(Boolean);
    if (walletIds.length === 0) {
      res.json({ wallets: [] });
      return;
    }

    const result = await accountService.getWalletsNetworksBatch(walletIds);
    res.json({ wallets: result });
  })
);

/**
 * GET /chains/available — 获取支持创建账户的链列表
 */
router.get("/chains/available", asyncHandler(async (_req: Request, res: Response) => {
  const chains = await accountService.getAvailableChains();
  res.json({ chains });
}));

export default router;
