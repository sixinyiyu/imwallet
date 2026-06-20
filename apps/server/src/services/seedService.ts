import prisma from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ChainType, TokenType, getNativeTokenSymbol } from "../config/chains";

/**
 * Seed service — runs on every app startup.
 * Ensures system-level config entries exist in app_configs table.
 * Also handles idempotent schema migrations for existing databases.
 */
export async function runSeed(): Promise<void> {
  try {
    // ─── Schema migration for existing databases ───
    await migrateSchema();

    // ─── Chains 种子数据 ───
    const chainsData = [
      { name: ChainType.Tron, displayName: "Tron (TRX)", isAccountSupported: true, derivationPath: "m/44'/195'/0'/0" },
      { name: ChainType.Ethereum, displayName: "Ethereum (ETH)", isAccountSupported: true, derivationPath: "m/44'/60'/0'/0" },
      { name: ChainType.Bitcoin, displayName: "Bitcoin (BTC)", isAccountSupported: true, derivationPath: "m/44'/0'/0'/0" },
    ];
    for (const chain of chainsData) {
      const existing = await prisma.chain.findUnique({ where: { name: chain.name } });
      if (!existing) {
        await prisma.chain.create({ data: chain });
        logger.info("SEED", `已创建 chain: ${chain.name}`);
      }
    }

    // ─── Tokens 种子数据（含 tokenType）───
    const tokensData = [
      { id: "token-trx-default", symbol: "TRX", name: "Tron", decimals: 6, network: ChainType.Tron, tokenType: TokenType.NATIVE, isActive: true, isTradable: true },
      { id: "token-usdt-default", symbol: "USDT", name: "Tether USD", decimals: 6, network: ChainType.Tron, tokenType: TokenType.STABLECOIN, isActive: true, isTradable: true },
      { id: "token-eth-default", symbol: "ETH", name: "Ethereum", decimals: 18, network: ChainType.Ethereum, tokenType: TokenType.NATIVE, isActive: true, isTradable: true },
      { id: "token-btc-default", symbol: "BTC", name: "Bitcoin", decimals: 8, network: ChainType.Bitcoin, tokenType: TokenType.NATIVE, isActive: true, isTradable: true },
    ];
    for (const token of tokensData) {
      const existing = await prisma.token.findUnique({ where: { symbol: token.symbol } });
      if (!existing) {
        await prisma.token.create({ data: token });
        logger.info("SEED", `已创建 token: ${token.symbol} (${token.network}, ${token.tokenType})`);
      } else {
        // 更新 tokenType 和 network（兼容旧数据）
        await prisma.token.update({
          where: { symbol: token.symbol },
          data: {
            tokenType: token.tokenType,
            network: token.network,
          },
        });
      }
    }

    // ─── AppConfig 种子数据 ─── (for service config password verification)
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

    // Ensure recharge_allowed_devices exists (default: empty array)
    // 充值允许设备列表，值为 JSON 数组字符串，如 ["device_id_1", "device_id_2"]
    const existingRechargeDevices = await prisma.appConfig.findUnique({
      where: { key: "recharge_allowed_devices" },
    });
    if (!existingRechargeDevices) {
      await prisma.appConfig.create({
        data: { key: "recharge_allowed_devices", value: "[]" },
      });
      logger.info("SEED", "已创建 recharge_allowed_devices 配置项: []");
    }
  } catch (err: any) {
    logger.warn("SEED", `种子数据初始化失败: ${err.message}`);
  }
}

/**
 * Idempotent schema migration for existing databases.
 *
 * Handles adding new columns and changing indexes that were introduced
 * after the initial init.sql was applied. These statements are safe to
 * run on every startup — they use IF NOT EXISTS / DO $$ EXCEPTION patterns.
 */
async function migrateSchema(): Promise<void> {
  const migrationStatements = [
    // 1. Add token_type column to tokens table
    `DO $$ BEGIN
      ALTER TABLE "tokens" ADD COLUMN "token_type" VARCHAR(16) NOT NULL DEFAULT 'NATIVE';
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;`,

    // 2. Add token_symbol column to accounts table
    `DO $$ BEGIN
      ALTER TABLE "accounts" ADD COLUMN "token_symbol" VARCHAR(16) NOT NULL DEFAULT '';
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;`,

    // 3. Backfill token_symbol for existing accounts based on network
    `UPDATE "accounts" SET "token_symbol" = CASE
      WHEN "network" = 'Tron' THEN 'TRX'
      WHEN "network" = 'Ethereum' THEN 'ETH'
      WHEN "network" = 'Bitcoin' THEN 'BTC'
      ELSE 'UNKNOWN'
    END WHERE "token_symbol" = '' OR "token_symbol" IS NULL;`,

    // 4. Add index column to accounts table
    `DO $$ BEGIN
      ALTER TABLE "accounts" ADD COLUMN "index" INT NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;`,

    // 5. Drop old unique index (wallet_id, network, token_symbol) if exists
    `DROP INDEX IF EXISTS "accounts_wallet_id_network_token_symbol_key";`,

    // 6. Create new unique index (wallet_id, network, token_symbol, index)
    `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wallet_id_network_token_symbol_index_key"
      ON "accounts"("wallet_id", "network", "token_symbol", "index");`,

    // 7. Update token_type for known tokens
    `UPDATE "tokens" SET "token_type" = 'STABLECOIN' WHERE "symbol" = 'USDT' AND ("token_type" IS NULL OR "token_type" = 'NATIVE');`,
    `UPDATE "tokens" SET "token_type" = 'NATIVE' WHERE "symbol" IN ('TRX', 'ETH', 'BTC') AND ("token_type" IS NULL OR "token_type" != 'NATIVE');`,
  ];

  for (const stmt of migrationStatements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: any) {
      // Log but don't fail — migration statements are idempotent
      logger.warn("SEED_MIGRATE", `Migration statement skipped: ${err.message}`);
    }
  }

  logger.info("SEED_MIGRATE", "Schema migration check completed");
}