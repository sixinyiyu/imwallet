import { z } from "zod";

/**
 * Validate alias weighted length:
 * - Each Chinese character counts as 2 units
 * - Each English/number character counts as 1 unit
 * - Total must be between 1 and 12 units
 * - Only Chinese characters and English/numbers are allowed
 */
function validateAliasWeightedLength(val: string): boolean {
  let weightedLen = 0;
  for (const char of val) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      weightedLen += 2;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      weightedLen += 1;
    } else {
      return false; // Invalid character (spaces, symbols, etc.)
    }
  }
  return weightedLen >= 1 && weightedLen <= 12;
}

const aliasWeightedLengthMessage = "钱包名称须为1-12个英文字符或1-6个汉字";

/**
 * Unified wallet creation/import schema.
 * - source: "CREATE" or "IMPORT" (required)
 * - alias: required, weighted length validation
 * - password: required
 * - passwordHint: optional
 * - mnemonic: required when source=IMPORT, optional when source=CREATE
 * - privateKey: optional (reserved for future use)
 */
export const walletSchema = z.object({
  source: z.enum(["CREATE", "IMPORT"], {
    required_error: "source is required",
    invalid_type_error: "source must be CREATE or IMPORT",
  }),
  alias: z
    .string()
    .min(1, "钱包名称不能为空")
    .refine(validateAliasWeightedLength, aliasWeightedLengthMessage),
  password: z.string().min(1, "密码不能为空"),
  passwordHint: z.string().max(128, "密码提示不能超过128个字符").optional(),
  mnemonic: z.string().optional(),
  privateKey: z.string().optional(),
}).refine(
  (data) => {
    // mnemonic is required when source=IMPORT
    if (data.source === "IMPORT" && !data.mnemonic) {
      return false;
    }
    return true;
  },
  {
    message: "助记词不能为空",
    path: ["mnemonic"],
  }
);

/**
 * Reset password schema.
 * - mnemonic: required (used to verify identity)
 * - password: required (new password)
 */
export const resetPasswordSchema = z.object({
  mnemonic: z.string().min(1, "助记词不能为空"),
  password: z.string().min(1, "密码不能为空"),
  passwordHint: z.string().max(128, "密码提示不能超过128个字符").optional(),
});
