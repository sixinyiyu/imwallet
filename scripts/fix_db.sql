-- 修复数据库表结构，使其与 Prisma schema 一致
-- 1. 修复 wallets 表：删除 identifier 列和索引
DROP INDEX IF EXISTS "wallets_identifier_key";
ALTER TABLE "wallets" DROP COLUMN IF EXISTS "identifier";

-- 2. 修复 wallets_addresses 表：删除 wallet_id 列，修改唯一索引
DROP INDEX IF EXISTS "wallets_addresses_wallet_id_chain_address_key";
ALTER TABLE "wallets_addresses" DROP COLUMN IF EXISTS "wallet_id";
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_addresses_chain_address_key" ON "wallets_addresses"("chain", "address");

-- 3. 重命名 account_assets 为 assets_addresses，添加 chain 字段
ALTER TABLE "account_assets" RENAME TO "assets_addresses";
ALTER TABLE "assets_addresses" RENAME CONSTRAINT "account_assets_pkey" TO "assets_addresses_pkey";
ALTER INDEX IF EXISTS "account_assets_address_id_asset_id_key" RENAME TO "assets_addresses_address_id_asset_id_key";
ALTER TABLE "assets_addresses" ADD COLUMN IF NOT EXISTS "chain" VARCHAR(64) NOT NULL DEFAULT '';
