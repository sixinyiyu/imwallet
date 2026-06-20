import prisma from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Seed service — runs on every app startup.
 * Ensures system-level config entries exist in app_configs table.
 */
export async function runSeed(): Promise<void> {
  try {
    // Ensure server_pwd exists (for service config password verification)
    const existingPwd = await prisma.appConfig.findUnique({
      where: { key: "server_pwd" },
    });
    if (!existingPwd) {
      await prisma.appConfig.create({
        data: { key: "server_pwd", value: "aquad2024" },
      });
      logger.info("SEED", "已创建 server_pwd 配置项");
    }

    // Ensure fee_rate exists (loaded from config file on first init)
    // Once the record exists, database value takes precedence over config file
    const existingFeeRate = await prisma.appConfig.findUnique({
      where: { key: "fee_rate" },
    });
    if (!existingFeeRate) {
      await prisma.appConfig.create({
        data: { key: "fee_rate", value: config.fee.rate.toString() },
      });
      logger.info("SEED", `已创建 fee_rate 配置项: ${config.fee.rate}`);
    }

    // Ensure fee_mode exists
    const existingFeeMode = await prisma.appConfig.findUnique({
      where: { key: "fee_mode" },
    });
    if (!existingFeeMode) {
      await prisma.appConfig.create({
        data: { key: "fee_mode", value: config.fee.mode },
      });
      logger.info("SEED", `已创建 fee_mode 配置项: ${config.fee.mode}`);
    }

    // Ensure tx_restrict_wallet exists (default: false)
    // 开启后仅支持系统内账户地址进行转账，不支持外部链上地址
    const existingTxRestrict = await prisma.appConfig.findUnique({
      where: { key: "tx_restrict_wallet" },
    });
    if (!existingTxRestrict) {
      await prisma.appConfig.create({
        data: { key: "tx_restrict_wallet", value: "false" },
      });
      logger.info("SEED", "已创建 tx_restrict_wallet 配置项: false");
    }
  } catch (err: any) {
    logger.warn("SEED", `种子数据初始化失败: ${err.message}`);
  }
}