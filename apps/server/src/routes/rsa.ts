import { Router, Request, Response, NextFunction } from "express";
import { getPublicKey } from "../services/rsaService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/**
 * GET /rsa/public-key
 * Returns the RSA public key for client-side password encryption.
 */
router.get(
  "/public-key",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ publicKey: getPublicKey() });
  })
);

export default router;