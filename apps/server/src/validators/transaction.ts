import { z } from "zod";

export const transferSchema = z.object({
  fromWalletId: z.string().min(1, "请选择发送钱包"),
  toAddress: z.string().min(1, "请输入收款地址"),
  amount: z
    .string()
    .refine(
      (val) => {
        const num = parseFloat(val);
        return /^\d+(\.\d{1,8})?$/.test(val) && num >= 0.01 && num <= 999999999;
      },
      "转账金额需在 0.01 ~ 999,999,999 之间，最多8位小数"
    ),
  tokenSymbol: z.string().min(1, "请选择代币类型"),
  network: z.string().min(1, "请选择网络"),
  memo: z.string().max(256).optional(),
});