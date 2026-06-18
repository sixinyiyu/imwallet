import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as accountService from "../services/accountService";
import { validate } from "../middleware/validate";
import { z } from "zod";
import prisma from "../config/prisma";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

const createAccountSchema = z.object({
  tokenId: z.string().min(1, "Token ID is required"),
  name: z.string().max(64, "Name too long").optional(),
  mnemonic: z.string().optional(),
});

/**
 * POST /wallets/:walletId/accounts — Create account under a wallet
 */
router.post(
  "/wallets/:walletId/accounts",
  validate(createAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.walletId as string;

    // Verify wallet belongs to device
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to access this wallet" });
      return;
    }

    const account = await accountService.createAccount(
      walletId,
      req.body.tokenId,
      req.body.name,
      req.body.mnemonic
    );
    res.status(201).json(account);
  })
);

/**
 * GET /wallets/:walletId/accounts — Get all accounts for a wallet
 */
router.get(
  "/wallets/:walletId/accounts",
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.walletId as string;

    // Verify wallet belongs to device
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to access this wallet" });
      return;
    }

    const accounts = await accountService.getWalletAccounts(walletId);
    res.json({ accounts });
  })
);

/**
 * GET /accounts/:accountId — Get account detail
 */
router.get(
  "/accounts/:accountId",
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;

    const account = await accountService.getAccountDetail(accountId);

    // Verify wallet belongs to device
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: account.walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to access this account" });
      return;
    }

    res.json(account);
  })
);

/**
 * DELETE /accounts/:accountId — Delete an account
 */
router.delete(
  "/accounts/:accountId",
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;

    const account = await accountService.getAccountDetail(accountId);

    // Verify wallet belongs to device
    const subscription = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: account.walletId,
        device: { device_id: req.device!.deviceId },
      },
    });
    if (!subscription) {
      res.status(403).json({ error: "You do not have permission to delete this account" });
      return;
    }

    await accountService.deleteAccount(accountId);
    res.status(204).send();
  })
);

/**
 * GET /tokens/available — Get available token types for account creation
 */
router.get(
  "/tokens/available",
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await accountService.getAvailableTokens();
    res.json(result);
  })
);

export default router;