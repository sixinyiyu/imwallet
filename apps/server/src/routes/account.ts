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
  network: z.string().min(1, "Network is required"),
  name: z.string().max(64, "Name too long").optional(),
  mnemonic: z.string().optional(),
});

/**
 * Helper: 验证设备是否关联该钱包（手动查找设备，不使用 relation filter）
 */
async function checkWalletOwnership(walletId: string, deviceId: string): Promise<boolean> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) return false;

  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: device.id,
    },
  });
  return !!subscription;
}

/**
 * POST /wallets/:walletId/accounts — Create account under a wallet for a network
 */
router.post(
  "/wallets/:walletId/accounts",
  validate(createAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const walletId = req.params.walletId as string;

    // Verify wallet belongs to device
    const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
    if (!hasPermission) {
      res.status(403).json({ error: "You do not have permission to access this wallet" });
      return;
    }

    const account = await accountService.createAccount(
      walletId,
      req.body.network,
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
    const hasPermission = await checkWalletOwnership(walletId, req.device!.deviceId);
    if (!hasPermission) {
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
    const hasPermission = await checkWalletOwnership(account.walletId, req.device!.deviceId);
    if (!hasPermission) {
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
    const hasPermission = await checkWalletOwnership(account.walletId, req.device!.deviceId);
    if (!hasPermission) {
      res.status(403).json({ error: "You do not have permission to delete this account" });
      return;
    }

    await accountService.deleteAccount(accountId);
    res.status(204).send();
  })
);

/**
 * GET /wallets/networks/batch — Batch get account networks for multiple wallets
 * Returns deduplicated network list per wallet, for lightweight UI display
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
 * GET /networks/available — Get available networks for account creation
 * Only returns tokens where isAccountToken=true, grouped by network
 */
router.get(
  "/networks/available",
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await accountService.getAvailableNetworks();
    res.json(result);
  })
);

export default router;