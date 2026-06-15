import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import * as tokenService from "../services/tokenService";
import prisma from "../config/prisma";

const router = Router();

router.use(authMiddleware);

// GET / — list all active tokens
router.get("/", async (req: Request, res: Response) => {
  const tokens = await tokenService.getAllTokens();
  res.json({ tokens });
});

// 权限校验辅助函数：管理员可查看任意钱包，普通用户只能查看自己的
async function checkWalletPermission(walletId: string, userId: string, role: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  const userWallet = await prisma.userWallet.findFirst({
    where: { walletId, userId },
  });
  return !!userWallet;
}

router.get("/:walletId/balance", async (req: Request, res: Response) => {
  const walletId = req.params.walletId as string;
  const hasPermission = await checkWalletPermission(walletId, req.user!.userId, req.user!.role);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }
  const result = await tokenService.getWalletBalance(walletId);
  res.json(result);
});

router.get("/:walletId/list", async (req: Request, res: Response) => {
  const walletId = req.params.walletId as string;
  const hasPermission = await checkWalletPermission(walletId, req.user!.userId, req.user!.role);
  if (!hasPermission) {
    res.status(403).json({ error: "You do not have permission to view this wallet" });
    return;
  }
  const tokens = await tokenService.getTokenBalances(walletId);
  res.json({ tokens });
});

export default router;