import dotenv from "dotenv";

dotenv.config();

/**
 * Fee deduction mode:
 * - EXTRA: Sender pays amount + fee, recipient receives full amount.
 *   Example: A sends 10, fee 0.1 → A pays 10.1, B receives 10, platform gets 0.1
 * - DEDUCTED: Sender pays amount, recipient receives amount - fee.
 *   Example: A sends 10, fee 0.1 → A pays 10, B receives 9.9, platform gets 0.1
 */
export type FeeMode = "EXTRA" | "DEDUCTED";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  fee: {
    rate: parseFloat(process.env.FEE_RATE || "0.005"), // 0.5%
    mode: (process.env.FEE_MODE || "DEDUCTED") as FeeMode, // default: deduct from amount
  },
};
