-- 1. Wallet: 去掉 identifier 字段，id 改为 String（客户端生成的 aqud+hash）
-- 先删除 identifier 的 unique 约束
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_identifier_key";
-- 删除 identifier 列
ALTER TABLE "wallets" DROP COLUMN IF EXISTS "identifier";
-- 将 id 列从 uuid 默认改为 String（保留为 VARCHAR(36)）
-- 注意：PostgreSQL 的 id 列已经是 TEXT 类型（Prisma @default(uuid()) 生成的），
-- 所以类型不需要改，只需去掉 default

-- 2. WalletAddress: 去掉 wallet_id 字段，更新唯一约束
-- 删除旧的 unique 约束（walletId, chain, address）
ALTER TABLE "wallets_addresses" DROP CONSTRAINT IF EXISTS "wallets_addresses_walletId_chain_address_key";
-- 删除 wallet_id 列
ALTER TABLE "wallets_addresses" DROP COLUMN IF EXISTS "wallet_id";
-- 添加新的 unique 约束（chain, address）—— 全局唯一地址
ALTER TABLE "wallets_addresses" ADD CONSTRAINT "wallets_addresses_chain_address_key" UNIQUE ("chain", "address");

-- 3. AccountAsset → AssetsAddress: 重命名表，添加 chain 字段
ALTER TABLE "account_assets" RENAME TO "assets_addresses";
-- 添加 chain 字段
ALTER TABLE "assets_addresses" ADD COLUMN "chain" TEXT NOT NULL DEFAULT '';
-- 更新 chain 字段值：从关联的 wallets_addresses 表获取
UPDATE "assets_addresses" SET "chain" = (
  SELECT wa.chain FROM "wallets_addresses" wa WHERE wa.id = "assets_addresses"."address_id"
);
