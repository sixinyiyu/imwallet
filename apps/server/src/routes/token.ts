import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import * as tokenService from "../services/tokenService";

const router = Router();

router.use(authMiddleware);

// GET / — list all active tokens
router.get("/", async (req: Request, res: Response) => {
  const tokens = await tokenService.getAllTokens();
  res.json({ tokens });
});

router.get("/:walletId/balance", async (req: Request, res: Response) => {
  const result = await tokenService.getWalletBalance(req.params.walletId as string);
  res.json(result);
});

router.get("/:walletId/list", async (req: Request, res: Response) => {
  const tokens = await tokenService.getTokenBalances(req.params.walletId as string);
  res.json({ tokens });
});

export default router;
