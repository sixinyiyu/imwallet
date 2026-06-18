-- ============================================================
-- Migration: Account 模型从按代币改为按网络
-- 
-- 变更内容：
--   1. accounts 表：去掉 token_id、balance 列，新增 network 列
--   2. accounts 表：去掉 address 全局唯一约束，改为 (wallet_id, network) 唯一
--   3. tokens 表：新增 is_account_token 列（区分可创建账户的代币和度量币）
--   4. 迁移旧数据：从 token.network 填充 account.network
--   5. 更新 tokens 种子数据：TRX is_account_token=true, USDT is_account_token=false
-- ============================================================

-- ─── Step 1: tokens 表新增 is_account_token 列 ──────────────────────────────
ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "is_account_token" BOOLEAN NOT NULL DEFAULT true;

-- ─── Step 2: accounts 表新增 network 列 ──────────────────────────────────────
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "network" VARCHAR(64);

-- ─── Step 3: 迁移旧数据 — 从关联的 token.network 填充 account.network ─────────
UPDATE "accounts" a
SET "network" = t."network"
FROM "tokens" t
WHERE a."token_id" = t."id" AND a."network" IS NULL;

-- 对于没有关联到 token 的记录，默认设为 Tron
UPDATE "accounts" SET "network" = 'Tron' WHERE "network" IS NULL;

-- ─── Step 4: 删除旧的唯一约束 ─────────────────────────────────────────────────
DROP INDEX IF EXISTS "accounts_address_key";
DROP INDEX IF EXISTS "accounts_wallet_id_token_id_key";

-- ─── Step 5: 删除 accounts 表的 token_id 和 balance 列 ───────────────────────
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "token_id";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "balance";

-- ─── Step 6: 新增 (wallet_id, network) 唯一约束 ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wallet_id_network_key" ON "accounts"("wallet_id", "network");

-- ─── Step 7: 更新 tokens 种子数据 ─────────────────────────────────────────────
-- TRX 可创建账户，USDT 不可创建账户（度量币）
UPDATE "tokens" SET "is_account_token" = true  WHERE "symbol" = 'TRX';
UPDATE "tokens" SET "is_account_token" = false WHERE "symbol" = 'USDT';
