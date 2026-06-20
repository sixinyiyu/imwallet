import prisma from "../config/prisma";
import { logger } from "../utils/logger";

/**
 * Seed service — runs on every app startup.
 * Ensures system-level config entries exist in app_configs table.
 */
export async function runSeed(): Promise<void> {
  try {
    // Ensure server_pwd exists (for service config password verification)
    const existing = await prisma.appConfig.findUnique({
      where: { key: "server_pwd" },
    });

    if (!existing) {
      await prisma.appConfig.create({
        data: {
          key: "server_pwd",
          value: "aquad2024",
        },
      });
      logger.info("SEED", "已创建 server_pwd 配置项");
    }
  } catch (err: any) {
    logger.warn("SEED", `种子数据初始化失败: ${err.message}`);
  }
}
