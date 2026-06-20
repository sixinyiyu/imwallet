-- ============================================================
-- IMWallet Database Init (Single File)
-- 幂等脚本：所有语句可安全重复执行
--   CREATE TYPE → DO $$ BEGIN ... EXCEPTION WHEN duplicate_object
--   CREATE TABLE → IF NOT EXISTS
--   CREATE UNIQUE INDEX → IF NOT EXISTS
--   INSERT → ON CONFLICT DO NOTHING / DO UPDATE
--   不建立数据库外键约束，数据完整性和级联删除由业务代码保证
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

DO $$ BEGIN
    CREATE TYPE "PlatformStore" AS ENUM ('appStore', 'googlePlay', 'fdroid');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- 设备表
CREATE TABLE IF NOT EXISTS "devices" (
    "id"                     SERIAL      NOT NULL,
    "device_id"              VARCHAR(64) NOT NULL,
    "platform"               "Platform" NOT NULL,
    "platform_store"         VARCHAR(16),
    "os"                     VARCHAR(32),
    "model"                  VARCHAR(64),
    "locale"                 VARCHAR(16),
    "version"                VARCHAR(32),
    "currency"               VARCHAR(8),
    "token"                  VARCHAR(256),
    "is_push_enabled"        BOOLEAN   NOT NULL DEFAULT false,
    "is_price_alerts_enabled" BOOLEAN   NOT NULL DEFAULT false,
    "subscriptions_version"  INT       DEFAULT 0,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "devices_device_id_key" ON "devices"("device_id");

-- 链表（区块链网络）
CREATE TABLE IF NOT EXISTS "chains" (
    "id"                   SERIAL      NOT NULL,
    "name"                 VARCHAR(64) NOT NULL,
    "display_name"         VARCHAR(64) NOT NULL,
    "is_account_supported" BOOLEAN     NOT NULL DEFAULT true,
    "derivation_path"      VARCHAR(128),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chains_name_key" ON "chains"("name");

-- 代币表
CREATE TABLE IF NOT EXISTS "tokens" (
    "id"               TEXT        NOT NULL,
    "symbol"           VARCHAR(16) NOT NULL,
    "name"             VARCHAR(64) NOT NULL,
    "decimals"         INT         NOT NULL DEFAULT 6,
    "network"          VARCHAR(64) NOT NULL DEFAULT 'Tron',
    "contract_address" VARCHAR(66),
    "icon_url"         VARCHAR(512),
    "is_active"        BOOLEAN     NOT NULL DEFAULT true,
    "is_tradable"      BOOLEAN     NOT NULL DEFAULT true,
    "token_type"       VARCHAR(16) NOT NULL DEFAULT 'NATIVE',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tokens_symbol_network_key" ON "tokens"("symbol", "network");

-- 钱包表
CREATE TABLE IF NOT EXISTS "wallets" (
    "id"           TEXT        NOT NULL,
    "identifier"   VARCHAR(36) NOT NULL,
    "alias"        VARCHAR(64) NOT NULL,
    "address"      VARCHAR(64) NOT NULL,
    "source"       "WalletSource" NOT NULL DEFAULT 'CREATE',
    "password"     VARCHAR(128) NOT NULL DEFAULT '',
    "password_hint" VARCHAR(128),
    "memo"         VARCHAR(256) NOT NULL DEFAULT '',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_identifier_key" ON "wallets"("identifier");
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_address_key" ON "wallets"("address");

-- 钱包代币余额表
CREATE TABLE IF NOT EXISTS "wallet_tokens" (
    "id"        TEXT        NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "token_id"  VARCHAR(36) NOT NULL,
    "balance"   DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_tokens_wallet_id_token_id_key" ON "wallet_tokens"("wallet_id", "token_id");

-- 账户表（按网络+代币，每个钱包每个网络每个代币可有多个账户，通过 index 区分）
CREATE TABLE IF NOT EXISTS "accounts" (
    "id"           TEXT        NOT NULL,
    "wallet_id"    VARCHAR(36) NOT NULL,
    "network"      VARCHAR(64) NOT NULL,
    "token_symbol" VARCHAR(16) NOT NULL DEFAULT '',
    "index"        INT         NOT NULL DEFAULT 0,
    "name"         VARCHAR(64) NOT NULL,
    "address"      VARCHAR(64) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wallet_id_network_token_symbol_index_key" ON "accounts"("wallet_id", "network", "token_symbol", "index");

-- 钱包-设备订阅关联表
CREATE TABLE IF NOT EXISTS "wallet_subscriptions" (
    "id"         SERIAL      NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "device_id"  INT       NOT NULL,
    "chain"      VARCHAR(32),
    "address_id" VARCHAR(36),
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
    "from_wallet_id" VARCHAR(36) NOT NULL,
    "from_address"  VARCHAR(64) NOT NULL,
    "to_wallet_id"  VARCHAR(36) NOT NULL DEFAULT '',
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

-- 联系人表
CREATE TABLE IF NOT EXISTS "contacts" (
    "id"         TEXT        NOT NULL,
    "device_id"  INT         NOT NULL,
    "name"       VARCHAR(64) NOT NULL,
    "address"    VARCHAR(64) NOT NULL,
    "network"    VARCHAR(64) NOT NULL DEFAULT 'Tron',
    "memo"       VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

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
    "device_id"       INT         NOT NULL,
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
    "wallet_address" VARCHAR(64) NOT NULL,
    "token_symbol"   VARCHAR(16) NOT NULL,
    "token_name"     VARCHAR(64) NOT NULL,
    "amount"         DECIMAL(30,8) NOT NULL,
    "memo"           VARCHAR(256) NOT NULL DEFAULT '',
    "device_id"      VARCHAR(64) NOT NULL,
    "platform"       VARCHAR(16) NOT NULL,
    "version"        VARCHAR(32),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharges_pkey" PRIMARY KEY ("id")
);

-- App日志表（客户端崩溃日志和关键业务失败日志）
CREATE TABLE IF NOT EXISTS "app_logs" (
    "id"         SERIAL      NOT NULL,
    "device_id"  VARCHAR(64),
    "platform"   VARCHAR(16),
    "version"    VARCHAR(32),
    "log_type"   VARCHAR(32) NOT NULL,
    "content"    TEXT        NOT NULL,
    "created_at" TIMESTAMP   NOT NULL DEFAULT NOW(),

    CONSTRAINT "app_logs_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ────────────────────────────────────────────────────────────
-- 不建立数据库外键约束，数据完整性和级联删除由业务代码保证

-- ─── Seed Data ───────────────────────────────────────────────────────────────

-- 链表种子数据
INSERT INTO "chains" ("name", "display_name", "is_account_supported", "derivation_path")
VALUES
    ('Tron',     'Tron (TRX)',     true, 'm/44''/195''/0''/0'),
    ('Ethereum', 'Ethereum (ETH)', true, 'm/44''/60''/0''/0'),
    ('Bitcoin',  'Bitcoin (BTC)',  true, 'm/44''/0''/0''/0')
ON CONFLICT ("name") DO NOTHING;

-- 代币: 每条链有原生主币 + USDT稳定币
INSERT INTO "tokens" ("id", "symbol", "name", "decimals", "network", "is_active", "is_tradable", "token_type", "created_at", "updated_at")
VALUES
    ('token-trx-default',  'TRX',  'Tron',        6, 'Tron',     true, true, 'NATIVE',     NOW(), NOW()),
    ('token-usdt-tron',    'USDT', 'Tether USD',  6, 'Tron',     true, true, 'STABLECOIN', NOW(), NOW()),
    ('token-eth-default',  'ETH',  'Ethereum',   18, 'Ethereum', true, true, 'NATIVE',     NOW(), NOW()),
    ('token-usdt-eth',     'USDT', 'Tether USD',  6, 'Ethereum', true, true, 'STABLECOIN', NOW(), NOW()),
    ('token-btc-default',  'BTC',  'Bitcoin',     8, 'Bitcoin',  true, true, 'NATIVE',     NOW(), NOW()),
    ('token-usdt-btc',     'USDT', 'Tether USD',  8, 'Bitcoin',  true, true, 'STABLECOIN', NOW(), NOW())
ON CONFLICT ("symbol", "network") DO UPDATE SET "is_tradable" = COALESCE(EXCLUDED."is_tradable", tokens."is_tradable", true), "token_type" = COALESCE(EXCLUDED."token_type", tokens."token_type", 'NATIVE'), "updated_at" = NOW();

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