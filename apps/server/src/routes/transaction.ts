import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { transferSchema } from "../validators/transaction";
import * as transactionService from "../services/transactionService";

const router = Router();

router.use(authMiddleware);

router.post(
  "/transfer",
  validate(transferSchema),
  async (req: Request, res: Response) => {
    const tx = await transactionService.transfer(req.body);
    res.status(201).json(tx);
  }
);

router.get("/", async (req: Request, res: Response) => {
  const walletId = req.query.walletId as string;
  if (!walletId) {
    res.status(400).json({ error: "walletId query parameter is required" });
    return;
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
  const tx = await transactionService.getTransactionDetail(req.params.id as string);
  res.json(tx);
});

export default router;