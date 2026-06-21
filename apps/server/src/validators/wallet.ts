import { z } from "zod";

/**
 * 钱包创建/导入 schema（精简版）
 * 服务端只接收 walletId + source，密码/助记词/别名在客户端本地处理
 * walletId 由客户端生成（aqud + SHA256(mnemonic)前32位hex）
 */
export const walletSchema = z.object({
  walletId: z.string().min(1, "walletId is required"),
  alias: z.string().max(64, "alias too long").optional(),
  source: z.enum(["CREATE", "IMPORT"], {
    required_error: "source is required",
    invalid_type_error: "source must be CREATE or IMPORT",
  }),
});

/**
 * 钱包地址同步 schema
 * 客户端创建账户后，同步地址到服务端 wallets_addresses
 */
export const walletAddressSchema = z.object({
  chain: z.string().min(1, "chain is required"),
  address: z.string().min(1, "address is required"),
});