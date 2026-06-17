-- Migration: v1.0.2 - Add Account model and Wallet fields (identifier, isBackedUp)
-- This migration adds the Account model and new fields to Wallet for 1.0.2 version

-- Step 1: Add identifier column with temporary default (will be updated per wallet)
ALTER TABLE "wallets" ADD COLUMN "identifier" VARCHAR(36);

-- Step 2: Populate identifier for existing wallets using format: aqud + random Base62
-- For existing wallets, generate a unique identifier
-- Note: In production, this should be done via a script. Here we use a simple approach.
UPDATE "wallets" SET "identifier" = 'aqud' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 32)
WHERE "identifier" IS NULL;

-- Step 3: Make identifier NOT NULL and add unique constraint
ALTER TABLE "wallets" ALTER COLUMN "identifier" SET NOT NULL;
CREATE UNIQUE INDEX "wallets_identifier_key" ON "wallets"("identifier");

-- Step 4: Add isBackedUp column (default false for backward compatibility)
ALTER TABLE "wallets" ADD COLUMN "is_backed_up" BOOLEAN NOT NULL DEFAULT false;

-- Step 5: Extend address column length to accommodate Tron addresses (T+33chars = 34 chars)
ALTER TABLE "wallets" ALTER COLUMN "address" SET DATA TYPE VARCHAR(64);

-- Step 6: Create Account table
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "token_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "balance" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- Step 7: Create unique indexes for Account
CREATE UNIQUE INDEX "accounts_address_key" ON "accounts"("address");
CREATE UNIQUE INDEX "accounts_wallet_id_token_id_key" ON "accounts"("wallet_id", "token_id");

-- Step 8: Add foreign keys for Account
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
