import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createWalletSchema,
  importWalletSchema,
} from "../validators/wallet";
import * as walletService from "../services/walletService";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  const wallets = await walletService.getUserWallets(req.user!.userId);
  res.json({ wallets });
});

router.post(
  "/",
  validate(createWalletSchema),
  async (req: Request, res: Response) => {
    const wallet = await walletService.createWallet(
      req.user!.userId,
      req.body.alias
    );
    res.status(201).json(wallet);
  }
);

router.post(
  "/import",
  validate(importWalletSchema),
  async (req: Request, res: Response) => {
    const wallet = await walletService.importWallet(
      req.user!.userId,
      req.body.mnemonic,
      req.body.alias,
      req.body.privateKey
    );
    res.status(201).json(wallet);
  }
);

router.get("/:id", async (req: Request, res: Response) => {
  const wallet = await walletService.getWalletDetail(
    req.params.id as string,
    req.user!.userId
  );
  res.json(wallet);
});

router.delete("/:id", async (req: Request, res: Response) => {
  await walletService.deleteWallet(req.params.id as string, req.user!.userId);
  res.status(204).send();
});

router.put("/:id/activate", async (req: Request, res: Response) => {
  await walletService.activateWallet(req.user!.userId, req.params.id as string);
  res.json({ message: "Wallet activated" });
});

export default router;
