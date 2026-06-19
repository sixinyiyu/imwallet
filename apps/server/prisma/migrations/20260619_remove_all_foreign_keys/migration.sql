-- Remove ALL foreign key constraints
-- Data integrity and cascade deletes are managed by application code

-- user_wallets
ALTER TABLE "user_wallets" DROP CONSTRAINT IF EXISTS "user_wallets_user_id_fkey";
ALTER TABLE "user_wallets" DROP CONSTRAINT IF EXISTS "user_wallets_wallet_id_fkey";

-- wallet_tokens
ALTER TABLE "wallet_tokens" DROP CONSTRAINT IF EXISTS "wallet_tokens_wallet_id_fkey";
ALTER TABLE "wallet_tokens" DROP CONSTRAINT IF EXISTS "wallet_tokens_token_id_fkey";

-- accounts
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_wallet_id_fkey";

-- wallet_subscriptions
ALTER TABLE "wallet_subscriptions" DROP CONSTRAINT IF EXISTS "wallet_subscriptions_wallet_id_fkey";
ALTER TABLE "wallet_subscriptions" DROP CONSTRAINT IF EXISTS "wallet_subscriptions_device_id_fkey";

-- transactions
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_from_wallet_id_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_token_id_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_to_wallet_id_fkey";

-- contacts
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_device_id_fkey";

-- Fix to_wallet_id: set NOT NULL with default '' (for external recipients)
UPDATE "transactions" SET "to_wallet_id" = '' WHERE "to_wallet_id" IS NULL;
ALTER TABLE "transactions" ALTER COLUMN "to_wallet_id" SET DEFAULT '';
ALTER TABLE "transactions" ALTER COLUMN "to_wallet_id" SET NOT NULL;
