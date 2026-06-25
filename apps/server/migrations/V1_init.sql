-- ===============================================================
-- IMWallet / rs-wallet - Database init & seed data
-- Driven by flyway 0.7 MigrationRunner, executed as V1
-- Idempotent: all statements can be safely re-executed
-- ===============================================================

-- --- Extensions ------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- Tables ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "devices" (
    "id"                     VARCHAR(64) NOT NULL,
    "platform"               VARCHAR(16) NOT NULL DEFAULT 'android',
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chains" (
    "id"                   SERIAL      NOT NULL,
    "name"                 VARCHAR(64) NOT NULL,
    "display_name"         VARCHAR(64) NOT NULL,
    "account_enable"       BOOLEAN     NOT NULL DEFAULT true,
    "derivation_path"      VARCHAR(128) NOT NULL DEFAULT '',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "chains_name_key" ON "chains"("name");

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

CREATE TABLE IF NOT EXISTS "wallets" (
    "id"           TEXT        NOT NULL,
    "alias"        VARCHAR(64) NOT NULL DEFAULT '',
    "source"       VARCHAR(16) NOT NULL DEFAULT 'CREATE',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wallets_addresses" (
    "id"           TEXT        NOT NULL,
    "chain"        VARCHAR(64) NOT NULL,
    "address"      VARCHAR(64) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallets_addresses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_addresses_chain_address_key" ON "wallets_addresses"("chain", "address");
CREATE INDEX IF NOT EXISTS "wallets_addresses_address_idx" ON "wallets_addresses"("address");

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

CREATE TABLE IF NOT EXISTS "transactions" (
    "id"            TEXT        NOT NULL,
    "tx_hash"       VARCHAR(66) NOT NULL,
    "from_address"  VARCHAR(64) NOT NULL,
    "to_address"    VARCHAR(128) NOT NULL,
    "token_symbol"  VARCHAR(16) NOT NULL,
    "amount"        DECIMAL(30,8) NOT NULL,
    "fee"           DECIMAL(30,8) NOT NULL DEFAULT 0,
    "status"        VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "memo"          VARCHAR(256) NOT NULL DEFAULT '',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_tx_hash_key" ON "transactions"("tx_hash");

CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT        NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "title"      VARCHAR(128) NOT NULL,
    "content"    TEXT        NOT NULL,
    "type"       VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_wallet_id_idx" ON "notifications"("wallet_id");

CREATE TABLE IF NOT EXISTS "app_configs" (
    "id"         SERIAL      NOT NULL,
    "key"        VARCHAR(64) NOT NULL,
    "value"      VARCHAR(256) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "app_configs_key_key" ON "app_configs"("key");

CREATE TABLE IF NOT EXISTS "recharges" (
    "id"              TEXT        NOT NULL,
    "wallet_id"       VARCHAR(36) NOT NULL,
    "wallet_alias"    VARCHAR(64) NOT NULL,
    "account_address" VARCHAR(64) NOT NULL,
    "token_symbol"    VARCHAR(16) NOT NULL,
    "token_name"      VARCHAR(64) NOT NULL,
    "amount"          DECIMAL(30,8) NOT NULL,
    "memo"            VARCHAR(256) NOT NULL DEFAULT '',
    "device_id"       VARCHAR(64) NOT NULL,
    "platform"        VARCHAR(16) NOT NULL,
    "version"         VARCHAR(32) NOT NULL DEFAULT '',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recharges_pkey" PRIMARY KEY ("id")
);

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

-- ===============================================================
-- Seed Data - Idempotent inserts, runs with V1, skipped on subsequent starts
-- ===============================================================

INSERT INTO "chains" ("name", "display_name", "account_enable", "derivation_path")
VALUES
    ('Tron',     'Tron (TRX)',     true, 'm/44''/195''/0''/0'),
    ('Ethereum', 'Ethereum (ETH)', true, 'm/44''/60''/0''/0'),
    ('Bitcoin',  'Bitcoin (BTC)',  true, 'm/44''/0''/0''/0')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "assets" ("id", "symbol", "name", "decimals", "chain", "type", "token_id", "is_default", "is_active", "is_tradable", "created_at", "updated_at")
VALUES
    ('asset-trx-tron',      'TRX',  'Tron',        6,  'Tron',     'NATIVE', '',                                         true,  true,  true,  NOW(), NOW()),
    ('asset-usdt-tron',     'USDT', 'Tether USD',  6,  'Tron',     'TOKEN',  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',       true,  true,  true,  NOW(), NOW()),
    ('asset-eth-ethereum',  'ETH',  'Ethereum',   18,  'Ethereum', 'NATIVE', '',                                         true,  false, false, NOW(), NOW()),
    ('asset-usdt-ethereum', 'USDT', 'Tether USD',  6,  'Ethereum', 'TOKEN',  '0xdAC17F958D2ee523a2206206994597C13D831ec7', true,  false, false, NOW(), NOW()),
    ('asset-btc-bitcoin',   'BTC',  'Bitcoin',     8,  'Bitcoin',  'NATIVE', '',                                         true,  false, false, NOW(), NOW())
ON CONFLICT ("symbol", "chain") DO UPDATE SET
    "is_active"   = EXCLUDED."is_active",
    "is_tradable" = EXCLUDED."is_tradable",
    "is_default"  = EXCLUDED."is_default",
    "type"        = EXCLUDED."type",
    "token_id"    = EXCLUDED."token_id",
    "updated_at"  = NOW();

INSERT INTO "fiat_currencies" ("id", "code", "name", "symbol", "rate", "decimals", "updated_at")
VALUES
    (gen_random_uuid(), 'USD', 'US Dollar',    '$',  1.0,   2, NOW()),
    (gen_random_uuid(), 'CNY', 'CNY Yuan',       'CNY', 7.25,  2, NOW()),
    (gen_random_uuid(), 'EUR', 'Euro',          'EUR', 0.92,  2, NOW()),
    (gen_random_uuid(), 'JPY', 'Japanese Yen',  'JPY', 155.0, 0, NOW())
ON CONFLICT ("code") DO UPDATE SET "rate" = EXCLUDED."rate", "updated_at" = NOW();

INSERT INTO "app_configs" ("key", "value")
VALUES
    ('server_pwd',              'CHANGE_ME'),  -- Override via SERVER_PWD env var, do not commit real password
    ('fee_rate',                '0.005'),
    ('fee_mode',                'DEDUCTED'),
    ('tx_restrict_wallet',      'true'),
    ('recharge_allowed_devices', '[]')
ON CONFLICT ("key") DO NOTHING;
