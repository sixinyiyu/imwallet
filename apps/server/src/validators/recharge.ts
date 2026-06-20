import { z } from "zod";

export const rechargeSchema = z.object({
  walletId: z.string().min(1, "请选择钱包"),
  tokenSymbol: z.string().min(1, "请选择代币"),
  amount: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return /^\d+(\.\d{1,8})?$/.test(val) && num > 0 && num <= 999999999;
      },
      "充值金额需大于 0，最多8位小数"
    ),
  memo: z.string().max(256).optional(),
});
