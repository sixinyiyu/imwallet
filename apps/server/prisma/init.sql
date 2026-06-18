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
    CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('NORMAL', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT', 'ACCOUNT_ACTIVATED', 'ACCOUNT_REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AdminRole" AS ENUM ('ADMIN');
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

-- 管理员表
CREATE TABLE IF NOT EXISTS "admins" (
    "id"         SERIAL      NOT NULL,
    "device_id"  VARCHAR(64) NOT NULL,
    "role"       "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "admins_device_id_key" ON "admins"("device_id");

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

-- 用户表
CREATE TABLE IF NOT EXISTS "users" (
    "id"           TEXT        NOT NULL,
    "username"     VARCHAR(32) NOT NULL,
    "password_hash" VARCHAR(60) NOT NULL,
    "device_info"  TEXT        NOT NULL DEFAULT '',
    "status"       "UserStatus" NOT NULL DEFAULT 'PENDING',
    "role"         "UserRole" NOT NULL DEFAULT 'NORMAL',
    "deleted_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

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
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tokens_symbol_key" ON "tokens"("symbol");

-- 钱包表
CREATE TABLE IF NOT EXISTS "wallets" (
    "id"           TEXT        NOT NULL,
    "identifier"   VARCHAR(36) NOT NULL,
    "alias"        VARCHAR(64) NOT NULL,
    "address"      VARCHAR(64) NOT NULL,
    "source"       "WalletSource" NOT NULL DEFAULT 'CREATE',
    "is_backed_up" BOOLEAN     NOT NULL DEFAULT false,
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

-- 账户表
CREATE TABLE IF NOT EXISTS "accounts" (
    "id"        TEXT        NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "token_id"  VARCHAR(36) NOT NULL,
    "name"      VARCHAR(64) NOT NULL,
    "address"   VARCHAR(64) NOT NULL,
    "balance"   DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_address_key" ON "accounts"("address");
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wallet_id_token_id_key" ON "accounts"("wallet_id", "token_id");

-- 用户-钱包关联表
CREATE TABLE IF NOT EXISTS "user_wallets" (
    "id"         TEXT        NOT NULL,
    "user_id"    VARCHAR(36) NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "is_active"  BOOLEAN     NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_wallets_user_id_wallet_id_key" ON "user_wallets"("user_id", "wallet_id");

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
    "to_wallet_id"  VARCHAR(36) NOT NULL,
    "token_id"      VARCHAR(36) NOT NULL,
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
    "address"    VARCHAR(42) NOT NULL,
    "memo"       VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- 通知表
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT        NOT NULL,
    "device_id"  INT         NOT NULL,
    "title"      VARCHAR(128) NOT NULL,
    "content"    TEXT        NOT NULL,
    "type"       "NotificationType" NOT NULL,
    "is_read"    BOOLEAN     NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ────────────────────────────────────────────────────────────
-- 不建立数据库外键约束，数据完整性和级联删除由业务代码保证

-- ─── Seed Data ───────────────────────────────────────────────────────────────

-- 代币: USDT, TRX
INSERT INTO "tokens" ("id", "symbol", "name", "decimals", "network", "is_active", "created_at", "updated_at")
VALUES
    ('token-usdt-default', 'USDT', 'Tether USD', 6, 'Tron', true, NOW(), NOW()),
    ('token-trx-default',  'TRX',  'Tron',       6, 'Tron', true, NOW(), NOW())
ON CONFLICT ("symbol") DO NOTHING;

-- 法币汇率
INSERT INTO "fiat_currencies" ("id", "code", "name", "symbol", "rate", "decimals", "updated_at")
VALUES
    (gen_random_uuid(), 'USD', 'US Dollar',       '$', 1.0,    2, NOW()),
    (gen_random_uuid(), 'CNY', '人民币',           '¥', 7.25,   2, NOW()),
    (gen_random_uuid(), 'EUR', 'Euro',             '€', 0.92,   2, NOW()),
    (gen_random_uuid(), 'JPY', 'Japanese Yen',     '¥', 155.0,  0, NOW())
ON CONFLICT ("code") DO UPDATE SET "rate" = EXCLUDED."rate", "updated_at" = NOW();

-- ─── Migration Tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_migrations" (
    "id"         SERIAL PRIMARY KEY,
    "name"       VARCHAR(255) NOT NULL UNIQUE,
    "checksum"   VARCHAR(32)  NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mark this init as applied
INSERT INTO "_migrations" ("name", "checksum") VALUES ('init', '0') ON CONFLICT ("name") DO NOTHING;