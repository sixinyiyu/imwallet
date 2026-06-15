import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { transferSchema } from "../validators/transaction";
import * as transactionService from "../services/transactionService";
import prisma from "../config/prisma";

const router = Router();

router.use(authMiddleware);

router.post(
  "/transfer",
  validate(transferSchema),
  async (req: Request, res: Response) => {
    const tx = await transactionService.transfer(req.body, req.user!.userId);
    res.status(201).json(tx);
  }
);

router.get("/", async (req: Request, res: Response) => {
  const walletId = req.query.walletId as string;
  if (!walletId) {
    res.status(400).json({ error: "walletId query parameter is required" });
    return;
  }

  // 权限校验：管理员可查看所有钱包交易，普通用户只能查看自己的
  if (req.user?.role !== "ADMIN") {
    const userWallet = await prisma.userWallet.findFirst({
      where: { walletId, userId: req.user!.userId },
    });
    if (!userWallet) {
      res.status(403).json({ error: "You do not have permission to view this wallet's transactions" });
      return;
    }
  }

  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 100);

  // Parse filter params
  const type = req.query.type as string | undefined;
  const timeRange = req.query.timeRange as string | undefined;
  const search = req.query.search as string | undefined;

  const result = await transactionService.getTransactions({
    walletId,
    page,
    limit,
    type: (type === "send" || type === "receive") ? type : undefined,
    timeRange: (["today", "7d", "30d", "90d"].includes(timeRange || "")) ? timeRange as any : undefined,
    search: search || undefined,
  });
  res.json(result);
});

router.get("/:id", async (req: Request, res: Response) => {
  const txId = req.params.id as string;
  const tx = await transactionService.getTransactionDetail(txId);

  // 权限校验：管理员可查看任意交易，普通用户只能查看与自己钱包相关的交易
  if (req.user?.role !== "ADMIN") {
    const userWallets = await prisma.userWallet.findMany({
      where: { userId: req.user!.userId },
      select: { walletId: true },
    });
    const myWalletIds = userWallets.map((uw: any) => uw.walletId);
    if (!myWalletIds.includes(tx.fromWalletId) && !myWalletIds.includes(tx.toWalletId)) {
      res.status(403).json({ error: "You do not have permission to view this transaction" });
      return;
    }
  }

  res.json(tx);
});

export default router;