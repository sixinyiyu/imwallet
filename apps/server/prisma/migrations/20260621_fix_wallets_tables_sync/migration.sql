-- ============================================================
-- Migration: 修复 wallets 相关表结构，使其与 Prisma schema 一致
-- 问题：数据库通过 init.sql 初始化，但 init.sql 过时，
--   遗留了 identifier、wallet_id 等已废弃字段，且表名/索引未同步
-- ============================================================

-- 1. wallets 表：删除遗留的 identifier 列和唯一索引，添加 alias 列
DROP INDEX IF EXISTS "wallets_identifier_key";
ALTER TABLE "wallets" DROP COLUMN IF EXISTS "identifier";
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "alias" VARCHAR(64) NOT NULL DEFAULT '';

-- 2. wallets_addresses 表：删除遗留的 wallet_id 列，更新唯一索引
DROP INDEX IF EXISTS "wallets_addresses_wallet_id_chain_address_key";
ALTER TABLE "wallets_addresses" DROP COLUMN IF EXISTS "wallet_id";
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_addresses_chain_address_key" ON "wallets_addresses"("chain", "address");

-- 3. account_assets → assets_addresses：重命名表，添加 chain 字段
ALTER TABLE IF EXISTS "account_assets" RENAME TO "assets_addresses";
ALTER TABLE IF EXISTS "assets_addresses" RENAME CONSTRAINT "account_assets_pkey" TO "assets_addresses_pkey";
ALTER INDEX IF EXISTS "account_assets_address_id_asset_id_key" RENAME TO "assets_addresses_address_id_asset_id_key";
ALTER TABLE "assets_addresses" ADD COLUMN IF NOT EXISTS "chain" VARCHAR(64) NOT NULL DEFAULT '';