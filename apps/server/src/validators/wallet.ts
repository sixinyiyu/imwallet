import { z } from "zod";

export const createWalletSchema = z.object({
  alias: z
    .string()
    .min(1, "Wallet alias is required")
    .max(64, "Wallet alias must be at most 64 characters"),
});

export const importWalletSchema = z.object({
  mnemonic: z.string().min(1, "Mnemonic phrase is required"),
  alias: z
    .string()
    .min(1, "Wallet alias is required")
    .max(64, "Wallet alias must be at most 64 characters"),
  privateKey: z.string().optional(),
});

export const activateWalletSchema = z.object({
  walletId: z.string().uuid("Invalid wallet ID"),
});
