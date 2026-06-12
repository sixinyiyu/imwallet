import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";

const router = Router();

router.use(authMiddleware);

/**
 * GET /config/fee
 * Returns fee configuration for client-side calculation.
 */
router.get("/fee", (_req: Request, res: Response) => {
  res.json({
    feeRate: config.fee.rate,
    feeMode: config.fee.mode,
  });
});

export default router;