-- Step 1: Create tokens table
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "network" VARCHAR(64) NOT NULL DEFAULT 'Private Chain',
    "contract_address" VARCHAR(66),
    "icon_url" VARCHAR(512),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tokens_symbol_key" ON "tokens"("symbol");

-- Step 2: Seed default tokens (USDT, TRX)
INSERT INTO "tokens" ("id", "symbol", "name", "decimals", "network", "is_active", "updated_at")
VALUES
    ('token-usdt-default', 'USDT', 'Tether USD', 6, 'Private Chain', true, CURRENT_TIMESTAMP),
    ('token-trx-default', 'TRX', 'Tron', 6, 'Tron Network', true, CURRENT_TIMESTAMP);

-- Step 3: Create wallet_tokens table
CREATE TABLE "wallet_tokens" (
    "id" TEXT NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "token_id" VARCHAR(36) NOT NULL,
    "balance" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_tokens_wallet_id_token_id_key" ON "wallet_tokens"("wallet_id", "token_id");

-- Step 4: Migrate existing wallet balances to wallet_tokens (USDT)
INSERT INTO "wallet_tokens" ("id", "wallet_id", "token_id", "balance", "updated_at")
SELECT
    CONCAT('wt-', w.id, '-usdt'),
    w.id,
    'token-usdt-default',
    w.balance,
    CURRENT_TIMESTAMP
FROM "wallets" w;

-- Step 5: Add TRX entries for existing wallets (balance = 0)
INSERT INTO "wallet_tokens" ("id", "wallet_id", "token_id", "balance", "updated_at")
SELECT
    CONCAT('wt-', w.id, '-trx'),
    w.id,
    'token-trx-default',
    0,
    CURRENT_TIMESTAMP
FROM "wallets" w;

-- Step 6: Add foreign keys for wallet_tokens
ALTER TABLE "wallet_tokens" ADD CONSTRAINT "wallet_tokens_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_tokens" ADD CONSTRAINT "wallet_tokens_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Add token_id to transactions (default to USDT for existing records)
ALTER TABLE "transactions" ADD COLUMN "token_id" VARCHAR(36) NOT NULL DEFAULT 'token-usdt-default';
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8: Drop balance column from wallets (data already migrated)
ALTER TABLE "wallets" DROP COLUMN "balance";