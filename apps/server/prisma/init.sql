-- ============================================================
-- IMWallet Database Init (Single File)
-- 包含所有建表 + 种子数据，用于全新数据库初始化
-- 用法: 应用启动时自动执行，或手动 psql -f init.sql
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "WalletSource" AS ENUM ('IMPORT', 'CREATE');
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
CREATE TYPE "UserRole" AS ENUM ('NORMAL', 'ADMIN');
CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT', 'ACCOUNT_ACTIVATED', 'ACCOUNT_REJECTED');
CREATE TYPE "AdminRole" AS ENUM ('ADMIN');
CREATE TYPE "Platform" AS ENUM ('ios', 'android', 'web');
CREATE TYPE "PlatformStore" AS ENUM ('appStore', 'googlePlay', 'fdroid');

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- 管理员表
CREATE TABLE "admins" (
    "id"         SERIAL      NOT NULL,
    "device_id"  VARCHAR(64) NOT NULL,
    "role"       "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admins_device_id_key" ON "admins"("device_id");

-- 设备表
CREATE TABLE "devices" (
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
CREATE UNIQUE INDEX "devices_device_id_key" ON "devices"("device_id");

-- 用户表
CREATE TABLE "users" (
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

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- 代币表
CREATE TABLE "tokens" (
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

CREATE UNIQUE INDEX "tokens_symbol_key" ON "tokens"("symbol");

-- 钱包表（最终版本：含 identifier, is_backed_up, password, address VARCHAR(64)）
CREATE TABLE "wallets" (
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

CREATE UNIQUE INDEX "wallets_identifier_key" ON "wallets"("identifier");
CREATE UNIQUE INDEX "wallets_address_key" ON "wallets"("address");

-- 钱包代币余额表
CREATE TABLE "wallet_tokens" (
    "id"        TEXT        NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "token_id"  VARCHAR(36) NOT NULL,
    "balance"   DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_tokens_wallet_id_token_id_key" ON "wallet_tokens"("wallet_id", "token_id");

-- 账户表
CREATE TABLE "accounts" (
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

CREATE UNIQUE INDEX "accounts_address_key" ON "accounts"("address");
CREATE UNIQUE INDEX "accounts_wallet_id_token_id_key" ON "accounts"("wallet_id", "token_id");

-- 用户-钱包关联表
CREATE TABLE "user_wallets" (
    "id"         TEXT        NOT NULL,
    "user_id"    VARCHAR(36) NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "is_active"  BOOLEAN     NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_wallets_user_id_wallet_id_key" ON "user_wallets"("user_id", "wallet_id");

-- 钱包-设备订阅关联表
CREATE TABLE "wallet_subscriptions" (
    "id"         SERIAL      NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "device_id"  INT       NOT NULL,
    "chain"      VARCHAR(32),
    "address_id" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_subscriptions_wallet_id_device_id_chain_address_id_key" ON "wallet_subscriptions"("wallet_id", "device_id", "chain", "address_id");

-- 法币汇率表
CREATE TABLE "fiat_currencies" (
    "id"       TEXT        NOT NULL,
    "code"     VARCHAR(8)  NOT NULL,
    "name"     VARCHAR(32) NOT NULL,
    "symbol"   VARCHAR(4)  NOT NULL,
    "rate"     DECIMAL(18,8) NOT NULL,
    "decimals" INT         NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiat_currencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiat_currencies_code_key" ON "fiat_currencies"("code");

-- 交易记录表
CREATE TABLE "transactions" (
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

CREATE UNIQUE INDEX "transactions_tx_hash_key" ON "transactions"("tx_hash");

-- 联系人表（关联到设备，不是用户）
CREATE TABLE "contacts" (
    "id"         TEXT        NOT NULL,
    "device_id"  INT         NOT NULL,
    "name"       VARCHAR(64) NOT NULL,
    "address"    VARCHAR(42) NOT NULL,
    "memo"       VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- 通知表（关联到设备）
CREATE TABLE "notifications" (
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
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_tokens" ADD CONSTRAINT "wallet_tokens_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_tokens" ADD CONSTRAINT "wallet_tokens_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_subscriptions" ADD CONSTRAINT "wallet_subscriptions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_subscriptions" ADD CONSTRAINT "wallet_subscriptions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_wallet_id_fkey" FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_wallet_id_fkey" FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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