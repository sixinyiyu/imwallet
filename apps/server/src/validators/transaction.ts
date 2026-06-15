import { z } from "zod";

export const transferSchema = z.object({
  fromWalletId: z.string().min(1, "Sender wallet ID is required"),
  toAddress: z.string().min(1, "Recipient address is required"),
  amount: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return /^\d+(\.\d{1,8})?$/.test(val) && num >= 0.01 && num <= 999999999;
      },
      "Amount must be between 0.01 and 999,999,999 with up to 8 decimal places"
    ),
  tokenId: z.string().min(1, "Token ID is required"),
  memo: z.string().max(256).optional(),
});