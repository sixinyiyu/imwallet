-- 1. Add to_address column (always records the chain address)
ALTER TABLE "transactions" ADD COLUMN "to_address" VARCHAR(128) NOT NULL DEFAULT '';

-- 2. Populate to_address from existing toWallet relation (via wallets.address)
UPDATE "transactions" t
SET "to_address" = w.address
FROM "wallets" w
WHERE t."to_wallet_id" = w.id;

-- 3. Change to_wallet_id default to empty string (external recipients use empty string, not null)
ALTER TABLE "transactions" ALTER COLUMN "to_wallet_id" SET DEFAULT '';

-- 4. Drop the existing foreign key constraint on to_wallet_id (remove FK, use code to manage relationship)
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_to_wallet_id_fkey";
