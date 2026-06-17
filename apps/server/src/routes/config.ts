import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import { config } from "../config";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

/**
 * GET /config/fee
 * Returns fee configuration for client-side calculation.
 */
router.get("/fee", asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    feeRate: config.fee.rate,
    feeMode: config.fee.mode,
  });
}));

export default router;
