import { z } from "zod";

export const transferSchema = z.object({
  fromWalletId: z.string().uuid("Invalid sender wallet ID"),
  toAddress: z.string().min(1, "Recipient address is required"),
  amount: z
    .string()
    .refine(
      (val) => /^\d+(\.\d{1,8})?$/.test(val) && parseFloat(val) > 0,
      "Amount must be a positive number with up to 8 decimal places"
    ),
  tokenId: z.string().uuid("Invalid token ID"),
  memo: z.string().max(256).optional(),
});
