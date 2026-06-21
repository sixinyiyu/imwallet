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
      { name: ChainType.Tron, displayName: "Tron (TRX)", accountEnable: true, derivationPath: "m/44'/195'/0'/0" },
      { name: ChainType.Ethereum, displayName: "Ethereum (ETH)", accountEnable: true, derivationPath: "m/44'/60'/0'/0" },
      { name: ChainType.Bitcoin, displayName: "Bitcoin (BTC)", accountEnable: true, derivationPath: "m/44'/0'/0'/0" },
    ];
    for (const chain of chainsData) {
      const existing = await prisma.chain.findUnique({ where: { name: chain.name } });
      if (!existing) {
        await prisma.chain.create({ data: chain });
        logger.info("SEED", `已创建 chain: ${chain.name}`);
      }
    }

    // ─── Assets 种子数据 ───
    // 每条链的原生币 + USDT代币（Bitcoin不支持token）
    const assetsData = [
      { id: "asset-trx-tron",      symbol: "TRX",  name: "Tron",       decimals: 6,  chain: ChainType.Tron,     type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-usdt-tron",     symbol: "USDT", name: "Tether USD", decimals: 6,  chain: ChainType.Tron,     type: TokenType.TOKEN,      tokenId: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-eth-ethereum",  symbol: "ETH",  name: "Ethereum",   decimals: 18, chain: ChainType.Ethereum, type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-usdt-ethereum", symbol: "USDT", name: "Tether USD", decimals: 6,  chain: ChainType.Ethereum, type: TokenType.TOKEN,      tokenId: "0xdAC17F958D2ee523a2206206994597C13D831ec7",      isDefault: true, isActive: true, isTradable: true },
      { id: "asset-btc-bitcoin",   symbol: "BTC",  name: "Bitcoin",    decimals: 8,  chain: ChainType.Bitcoin,  type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
    ];
    for (const asset of assetsData) {
      const existing = await prisma.asset.findFirst({ where: { symbol: asset.symbol, chain: asset.chain } });
      if (!existing) {
        await prisma.asset.create({ data: asset });
        logger.info("SEED", `已创建 asset: ${asset.symbol} (${asset.chain}, ${asset.type})`);
      } else {
        await prisma.asset.update({
          where: { id: existing.id },
          data: {
            type: asset.type,
            tokenId: asset.tokenId,
            isDefault: asset.isDefault,
            isTradable: asset.isTradable,
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
 * Handles the Token→Asset architecture migration:
 * - Create assets table (replaces tokens)
 * - Create account_assets table (replaces wallet_tokens)
 * - Simplify accounts table (remove token_symbol, add index)
 * - Migrate data from old tables to new tables
 */
async function migrateSchema(): Promise<void> {
  const migrationStatements = [
    // 1. Create assets table if not exists
    `CREATE TABLE IF NOT EXISTS "assets" (
      "id"          TEXT        NOT NULL,
      "symbol"      VARCHAR(16) NOT NULL,
      "name"        VARCHAR(64) NOT NULL,
      "decimals"    INT         NOT NULL DEFAULT 6,
      "chain"       VARCHAR(64) NOT NULL,
      "type"        VARCHAR(16) NOT NULL DEFAULT 'NATIVE',
      "token_id"    VARCHAR(66),
      "icon_url"    VARCHAR(512),
      "is_default"  BOOLEAN     NOT NULL DEFAULT true,
      "is_active"   BOOLEAN     NOT NULL DEFAULT true,
      "is_tradable" BOOLEAN     NOT NULL DEFAULT true,
      "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "assets_symbol_chain_key" ON "assets"("symbol", "chain");`,

    // 2. Create account_assets table if not exists
    `CREATE TABLE IF NOT EXISTS "account_assets" (
      "id"         TEXT        NOT NULL,
      "account_id" VARCHAR(36) NOT NULL,
      "asset_id"   VARCHAR(36) NOT NULL,
      "balance"    DECIMAL(30,8) NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "account_assets_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "account_assets_account_id_asset_id_key" ON "account_assets"("account_id", "asset_id");`,

    // 3. Add index column to accounts table if not exists
    `DO $$ BEGIN
      ALTER TABLE "accounts" ADD COLUMN "index" INT NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;`,

    // 4. Drop token_symbol column from accounts if it exists (cleanup from old schema)
    `ALTER TABLE "accounts" DROP COLUMN IF EXISTS "token_symbol";`,

    // 5. Drop old account indexes and create new one (without token_symbol)
    `DROP INDEX IF EXISTS "accounts_wallet_id_network_token_symbol_index_key";`,
    `DROP INDEX IF EXISTS "accounts_wallet_id_network_key";`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wallet_id_network_index_key" ON "accounts"("wallet_id", "network", "index");`,

    // 6. Seed assets data from tokens table (if tokens table exists)
    //    FIX: 原代码引用 t."token_type" 列，但 tokens 表从未有过此列，导致迁移静默失败
    //    改用 contract_address 判断 NATIVE/TOKEN；is_tradable 用 true 默认值（runSeed 会更新）
    `DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tokens') THEN
        INSERT INTO "assets" ("id", "symbol", "name", "decimals", "chain", "type", "token_id", "is_default", "is_active", "is_tradable", "created_at", "updated_at")
        SELECT
          CONCAT('asset-', LOWER(t."symbol"), '-', LOWER(t."network")),
          t."symbol", t."name", t."decimals", t."network",
          CASE WHEN t."contract_address" IS NOT NULL AND t."contract_address" != '' THEN 'TOKEN' ELSE 'NATIVE' END,
          t."contract_address",
          true, t."is_active", true, NOW(), NOW()
        FROM "tokens" t
        WHERE NOT EXISTS (SELECT 1 FROM "assets" a WHERE a."symbol" = t."symbol" AND a."chain" = t."network")
        ON CONFLICT DO NOTHING;
      END IF;
    END $$;`,

    // 7. Update asset token_id for known contracts
    `UPDATE "assets" SET "token_id" = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' WHERE "symbol" = 'USDT' AND "chain" = 'Tron' AND ("token_id" IS NULL OR "token_id" = '');`,
    `UPDATE "assets" SET "token_id" = '0xdAC17F958D2ee523a2206206994597C13D831ec7' WHERE "symbol" = 'USDT' AND "chain" = 'Ethereum' AND ("token_id" IS NULL OR "token_id" = '');`,

    // 9. Drop wallet_id columns from transactions table (replaced by from_address/to_address)
  `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "from_wallet_id";`,
  `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "to_wallet_id";`,

    // 10. Rename chains.is_account_supported → chains.account_enable
    //     PostgreSQL 不支持 RENAME COLUMN IF EXISTS，用 DO 块 + 异常处理实现幂等
    `DO $$ BEGIN
      ALTER TABLE "chains" RENAME COLUMN "is_account_supported" TO "account_enable";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;`,

    // 11. String columns: NULL → '' (set default + update existing NULLs)
    // devices
    `ALTER TABLE "devices" ALTER COLUMN "platform_store" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "platform_store" SET NOT NULL;`,
    `UPDATE "devices" SET "platform_store" = '' WHERE "platform_store" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "os" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "os" SET NOT NULL;`,
    `UPDATE "devices" SET "os" = '' WHERE "os" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "model" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "model" SET NOT NULL;`,
    `UPDATE "devices" SET "model" = '' WHERE "model" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "locale" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "locale" SET NOT NULL;`,
    `UPDATE "devices" SET "locale" = '' WHERE "locale" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "version" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "version" SET NOT NULL;`,
    `UPDATE "devices" SET "version" = '' WHERE "version" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "currency" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "currency" SET NOT NULL;`,
    `UPDATE "devices" SET "currency" = '' WHERE "currency" IS NULL;`,
    `ALTER TABLE "devices" ALTER COLUMN "token" SET DEFAULT '';`,
    `ALTER TABLE "devices" ALTER COLUMN "token" SET NOT NULL;`,
    `UPDATE "devices" SET "token" = '' WHERE "token" IS NULL;`,
    // chains
    `ALTER TABLE "chains" ALTER COLUMN "derivation_path" SET DEFAULT '';`,
    `ALTER TABLE "chains" ALTER COLUMN "derivation_path" SET NOT NULL;`,
    `UPDATE "chains" SET "derivation_path" = '' WHERE "derivation_path" IS NULL;`,
    // assets
    `ALTER TABLE "assets" ALTER COLUMN "token_id" SET DEFAULT '';`,
    `ALTER TABLE "assets" ALTER COLUMN "token_id" SET NOT NULL;`,
    `UPDATE "assets" SET "token_id" = '' WHERE "token_id" IS NULL;`,
    `ALTER TABLE "assets" ALTER COLUMN "icon_url" SET DEFAULT '';`,
    `ALTER TABLE "assets" ALTER COLUMN "icon_url" SET NOT NULL;`,
    `UPDATE "assets" SET "icon_url" = '' WHERE "icon_url" IS NULL;`,
    // wallets
    `ALTER TABLE "wallets" ALTER COLUMN "password_hint" SET DEFAULT '';`,
    `ALTER TABLE "wallets" ALTER COLUMN "password_hint" SET NOT NULL;`,
    `UPDATE "wallets" SET "password_hint" = '' WHERE "password_hint" IS NULL;`,
    // wallet_subscriptions
    `ALTER TABLE "wallet_subscriptions" ALTER COLUMN "chain" SET DEFAULT '';`,
    `ALTER TABLE "wallet_subscriptions" ALTER COLUMN "chain" SET NOT NULL;`,
    `UPDATE "wallet_subscriptions" SET "chain" = '' WHERE "chain" IS NULL;`,
    `ALTER TABLE "wallet_subscriptions" ALTER COLUMN "address_id" SET DEFAULT '';`,
    `ALTER TABLE "wallet_subscriptions" ALTER COLUMN "address_id" SET NOT NULL;`,
    `UPDATE "wallet_subscriptions" SET "address_id" = '' WHERE "address_id" IS NULL;`,
    // recharges
    `ALTER TABLE "recharges" ALTER COLUMN "version" SET DEFAULT '';`,
    `ALTER TABLE "recharges" ALTER COLUMN "version" SET NOT NULL;`,
    `UPDATE "recharges" SET "version" = '' WHERE "version" IS NULL;`,
    // app_logs
    `ALTER TABLE "app_logs" ALTER COLUMN "device_id" SET DEFAULT '';`,
    `ALTER TABLE "app_logs" ALTER COLUMN "device_id" SET NOT NULL;`,
    `UPDATE "app_logs" SET "device_id" = '' WHERE "device_id" IS NULL;`,
    `ALTER TABLE "app_logs" ALTER COLUMN "platform" SET DEFAULT '';`,
    `ALTER TABLE "app_logs" ALTER COLUMN "platform" SET NOT NULL;`,
    `UPDATE "app_logs" SET "platform" = '' WHERE "platform" IS NULL;`,
    `ALTER TABLE "app_logs" ALTER COLUMN "version" SET DEFAULT '';`,
    `ALTER TABLE "app_logs" ALTER COLUMN "version" SET NOT NULL;`,
    `UPDATE "app_logs" SET "version" = '' WHERE "version" IS NULL;`,

    // 12. Rename wallets.address → wallets.mnemonic_hash (PostgreSQL 不支持 RENAME COLUMN IF EXISTS)
    `DO $$ BEGIN
      ALTER TABLE "wallets" RENAME COLUMN "address" TO "mnemonic_hash";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;`,
    `ALTER TABLE "wallets" ALTER COLUMN "mnemonic_hash" SET DEFAULT '';`,
    `ALTER TABLE "wallets" ALTER COLUMN "mnemonic_hash" SET NOT NULL;`,
    `UPDATE "wallets" SET "mnemonic_hash" = '' WHERE "mnemonic_hash" IS NULL;`,
    `DROP INDEX IF EXISTS "wallets_address_key";`,
    //    将旧表 wallet_tokens(wallet_id, token_id, balance) 迁移到新表 account_assets(account_id, asset_id, balance)
    `DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_tokens') THEN
        INSERT INTO "account_assets" ("id", "account_id", "asset_id", "balance", "created_at", "updated_at")
        SELECT
          CONCAT('migrated-', wt."id"),
          a."id",
          ast."id",
          wt."balance",
          wt."created_at",
          wt."updated_at"
        FROM "wallet_tokens" wt
        JOIN "tokens" t ON wt."token_id" = t."id"
        JOIN "assets" ast ON ast."symbol" = t."symbol" AND ast."chain" = t."network"
        JOIN "accounts" a ON a."wallet_id" = wt."wallet_id" AND a."network" = t."network"
        WHERE NOT EXISTS (SELECT 1 FROM "account_assets" ca WHERE ca."account_id" = a."id" AND ca."asset_id" = ast."id")
        ON CONFLICT DO NOTHING;
      END IF;
    END $$;`,
  ];

  for (const stmt of migrationStatements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: any) {
      logger.warn("SEED_MIGRATE", `Migration statement skipped: ${err.message}`);
    }
  }

  logger.info("SEED_MIGRATE", "Schema migration check completed");
}