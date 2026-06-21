-- ============================================================
-- IMWallet Database Init Script (v1.0 — 2026-06-21)
-- ============================================================
-- 这是项目唯一的数据库初始化脚本，包含：
--   1. 扩展安装 (pgcrypto)
--   2. 枚举类型定义 (WalletSource / TxStatus / NotificationType / Platform)
--   3. 全部 14 张数据表建表语句
--   4. 种子数据 (chains / assets / fiat_currencies / app_configs)
--   5. 迁移追踪记录 (_migrations)
--
-- 部署新环境只需执行此一个文件即可：
--   psql -U <user> -d <database> -f init.sql
--
-- 幂等设计：所有语句可安全重复执行
--   CREATE TYPE → DO $$ BEGIN ... EXCEPTION WHEN duplicate_object
--   CREATE TABLE → IF NOT EXISTS
--   CREATE UNIQUE INDEX → IF NOT EXISTS
--   INSERT → ON CONFLICT DO NOTHING / DO UPDATE
--   不建立数据库外键约束，数据完整性和级联删除由业务代码保证
--
-- 对应 Prisma schema: apps/server/prisma/schema.prisma
-- 重置数据库请使用: drop-all.sql
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "WalletSource" AS ENUM ('IMPORT', 'CREATE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "Platform" AS ENUM ('ios', 'android', 'web');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- 设备表（精简：仅保留验签所需字段，完整设备信息在客户端 SQLite）
-- id 即 Ed25519 公钥 hex（64字符），直接作为主键
CREATE TABLE IF NOT EXISTS "devices" (
    "id"                     VARCHAR(64) NOT NULL,
    "platform"               "Platform" NOT NULL,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- 链表（区块链网络）
CREATE TABLE IF NOT EXISTS "chains" (
    "id"                   SERIAL      NOT NULL,
    "name"                 VARCHAR(64) NOT NULL,
    "display_name"         VARCHAR(64) NOT NULL,
    "account_enable"        BOOLEAN     NOT NULL DEFAULT true,
    "derivation_path"      VARCHAR(128) NOT NULL DEFAULT '',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chains_name_key" ON "chains"("name");

-- 资产表：定义每条链支持的资产（原生币/代币）
CREATE TABLE IF NOT EXISTS "assets" (
    "id"          TEXT        NOT NULL,
    "symbol"      VARCHAR(16) NOT NULL,
    "name"        VARCHAR(64) NOT NULL,
    "decimals"    INT         NOT NULL DEFAULT 6,
    "chain"       VARCHAR(64) NOT NULL,
    "type"        VARCHAR(16) NOT NULL DEFAULT 'NATIVE',
    "token_id"    VARCHAR(66) NOT NULL DEFAULT '',
    "icon_url"    VARCHAR(512) NOT NULL DEFAULT '',
    "is_default"  BOOLEAN     NOT NULL DEFAULT true,
    "is_active"   BOOLEAN     NOT NULL DEFAULT true,
    "is_tradable" BOOLEAN     NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assets_symbol_chain_key" ON "assets"("symbol", "chain");

-- 钱包表（精简：仅保留标识信息，密码/助记词/别名在客户端 SQLite）
-- id 由客户端生成（aqud + SHA256(mnemonic)前32位hex）
CREATE TABLE IF NOT EXISTS "wallets" (
    "id"           TEXT        NOT NULL,
    "alias"        VARCHAR(64) NOT NULL DEFAULT '',
    "source"       "WalletSource" NOT NULL DEFAULT 'CREATE',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- 钱包地址表（全局唯一）：替代原 accounts 表在服务端的角色
-- 客户端创建账户后，同步地址到此表
-- 地址与钱包的关联通过 wallet_subscriptions 实现
CREATE TABLE IF NOT EXISTS "wallets_addresses" (
    "id"           TEXT        NOT NULL,
    "chain"        VARCHAR(64) NOT NULL,
    "address"      VARCHAR(64) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_addresses_chain_address_key" ON "wallets_addresses"("chain", "address");
CREATE INDEX IF NOT EXISTS "wallets_addresses_address_idx" ON "wallets_addresses"("address");

-- 资产地址表：每个链上地址持有的各资产余额
-- 关联键为 address_id（关联 wallets_addresses.id）
CREATE TABLE IF NOT EXISTS "assets_addresses" (
    "id"         TEXT        NOT NULL,
    "address_id" VARCHAR(36) NOT NULL,
    "asset_id"   VARCHAR(36) NOT NULL,
    "chain"      VARCHAR(64) NOT NULL DEFAULT '',
    "balance"    DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assets_addresses_address_id_asset_id_key" ON "assets_addresses"("address_id", "asset_id");

-- 钱包-设备订阅关联表
CREATE TABLE IF NOT EXISTS "wallet_subscriptions" (
    "id"         SERIAL      NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "device_id"  VARCHAR(64) NOT NULL,
    "chain"      VARCHAR(32) NOT NULL DEFAULT '',
    "address_id" VARCHAR(36) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_subscriptions_wallet_id_device_id_chain_address_id_key" ON "wallet_subscriptions"("wallet_id", "device_id", "chain", "address_id");

-- 法币汇率表
CREATE TABLE IF NOT EXISTS "fiat_currencies" (
    "id"       TEXT        NOT NULL,
    "code"     VARCHAR(8)  NOT NULL,
    "name"     VARCHAR(32) NOT NULL,
    "symbol"   VARCHAR(4)  NOT NULL,
    "rate"     DECIMAL(18,8) NOT NULL,
    "decimals" INT         NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiat_currencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiat_currencies_code_key" ON "fiat_currencies"("code");

-- 交易记录表
CREATE TABLE IF NOT EXISTS "transactions" (
    "id"            TEXT        NOT NULL,
    "tx_hash"       VARCHAR(66) NOT NULL,
    "from_address"  VARCHAR(64) NOT NULL,
    "to_address"    VARCHAR(128) NOT NULL,
    "token_symbol"  VARCHAR(16) NOT NULL,
    "amount"        DECIMAL(30,8) NOT NULL,
    "fee"           DECIMAL(30,8) NOT NULL DEFAULT 0,
    "status"        "TxStatus" NOT NULL DEFAULT 'PENDING',
    "memo"          VARCHAR(256) NOT NULL DEFAULT '',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_tx_hash_key" ON "transactions"("tx_hash");

-- 通知表（关联钱包）
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT        NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "title"      VARCHAR(128) NOT NULL,
    "content"    TEXT        NOT NULL,
    "type"       "NotificationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_wallet_id_idx" ON "notifications"("wallet_id");

-- 通知阅读状态表（每个设备对每条通知的独立阅读状态）
CREATE TABLE IF NOT EXISTS "notification_reads" (
    "id"              SERIAL      NOT NULL,
    "notification_id" TEXT        NOT NULL,
    "device_id"       VARCHAR(64) NOT NULL,
    "is_read"         BOOLEAN     NOT NULL DEFAULT false,
    "read_at"         TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_notification_id_device_id_idx" ON "notification_reads"("notification_id", "device_id");

-- 应用配置表（key-value 字典表）
CREATE TABLE IF NOT EXISTS "app_configs" (
    "id"         SERIAL      NOT NULL,
    "key"        VARCHAR(64) NOT NULL,
    "value"      VARCHAR(256) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "app_configs_key_key" ON "app_configs"("key");

-- 充值记录表（管理员对系统内钱包进行代币充值）
CREATE TABLE IF NOT EXISTS "recharges" (
    "id"             TEXT        NOT NULL,
    "wallet_id"      VARCHAR(36) NOT NULL,
    "wallet_alias"   VARCHAR(64) NOT NULL,
    "account_address" VARCHAR(64) NOT NULL,
    "token_symbol"   VARCHAR(16) NOT NULL,
    "token_name"     VARCHAR(64) NOT NULL,
    "amount"         DECIMAL(30,8) NOT NULL,
    "memo"           VARCHAR(256) NOT NULL DEFAULT '',
    "device_id"      VARCHAR(64) NOT NULL,
    "platform"       VARCHAR(16) NOT NULL,
    "version"        VARCHAR(32) NOT NULL DEFAULT '',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharges_pkey" PRIMARY KEY ("id")
);

-- App日志表（客户端崩溃日志和关键业务失败日志）
CREATE TABLE IF NOT EXISTS "app_logs" (
    "id"         SERIAL      NOT NULL,
    "device_id"  VARCHAR(64) NOT NULL DEFAULT '',
    "platform"   VARCHAR(16) NOT NULL DEFAULT '',
    "version"    VARCHAR(32) NOT NULL DEFAULT '',
    "log_type"   VARCHAR(32) NOT NULL,
    "content"    TEXT        NOT NULL,
    "created_at" TIMESTAMP   NOT NULL DEFAULT NOW(),

    CONSTRAINT "app_logs_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ────────────────────────────────────────────────────────────
-- 不建立数据库外键约束，数据完整性和级联删除由业务代码保证

-- ─── Seed Data ───────────────────────────────────────────────────────────────

-- 链表种子数据
INSERT INTO "chains" ("name", "display_name", "account_enable", "derivation_path")
VALUES
    ('Tron',     'Tron (TRX)',     true, 'm/44''/195''/0''/0'),
    ('Ethereum', 'Ethereum (ETH)', true, 'm/44''/60''/0''/0'),
    ('Bitcoin',  'Bitcoin (BTC)',  true, 'm/44''/0''/0''/0')
ON CONFLICT ("name") DO NOTHING;

-- 资产种子数据：每条链的原生币 + USDT代币（Bitcoin不支持token）
INSERT INTO "assets" ("id", "symbol", "name", "decimals", "chain", "type", "token_id", "is_default", "is_active", "is_tradable", "created_at", "updated_at")
VALUES
    ('asset-trx-tron',     'TRX',  'Tron',        6,  'Tron',     'NATIVE', '',  true, true, true, NOW(), NOW()),
    ('asset-usdt-tron',    'USDT', 'Tether USD',  6,  'Tron',     'TOKEN',  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',          true, true, true, NOW(), NOW()),
    ('asset-eth-ethereum', 'ETH',  'Ethereum',   18,  'Ethereum', 'NATIVE', '',  true, true, false, NOW(), NOW()),
    ('asset-usdt-ethereum','USDT', 'Tether USD',  6,  'Ethereum', 'TOKEN',  '0xdAC17F958D2ee523a2206206994597C13D831ec7',  true, true, false, NOW(), NOW()),
    ('asset-btc-bitcoin',  'BTC',  'Bitcoin',     8,  'Bitcoin',  'NATIVE', '',  true, true, false, NOW(), NOW())
ON CONFLICT ("symbol", "chain") DO UPDATE SET
    "is_tradable" = EXCLUDED."is_tradable",
    "is_default"  = EXCLUDED."is_default",
    "type"        = EXCLUDED."type",
    "token_id"    = EXCLUDED."token_id",
    "updated_at"  = NOW();

-- 法币汇率
INSERT INTO "fiat_currencies" ("id", "code", "name", "symbol", "rate", "decimals", "updated_at")
VALUES
    (gen_random_uuid(), 'USD', 'US Dollar',       '$', 1.0,    2, NOW()),
    (gen_random_uuid(), 'CNY', '人民币',           '¥', 7.25,   2, NOW()),
    (gen_random_uuid(), 'EUR', 'Euro',             '€', 0.92,   2, NOW()),
    (gen_random_uuid(), 'JPY', 'Japanese Yen',     '¥', 155.0,  0, NOW())
ON CONFLICT ("code") DO UPDATE SET "rate" = EXCLUDED."rate", "updated_at" = NOW();

-- 应用配置种子数据
INSERT INTO "app_configs" ("key", "value")
VALUES
    ('server_pwd', 'ydyrxBsbxl@'),
    ('fee_rate', '0.005'),
    ('fee_mode', 'DEDUCTED'),
    ('tx_restrict_wallet', 'false'),
    ('recharge_allowed_devices', '[]')
ON CONFLICT ("key") DO NOTHING;

-- ─── Migration Tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_migrations" (
    "id"         SERIAL PRIMARY KEY,
    "name"       VARCHAR(255) NOT NULL UNIQUE,
    "checksum"   VARCHAR(32)  NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mark this init as applied
INSERT INTO "_migrations" ("name", "checksum") VALUES ('init', '0') ON CONFLICT ("name") DO NOTHING;