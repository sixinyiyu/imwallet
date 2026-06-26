-- ===============================================================
-- IMWallet / rs-wallet - V3: transactions table indexes
-- Optimizes the CTE-based transaction query:
--   WHERE from_address IN (...) OR to_address IN (...)
--   AND token_symbol = ...
--   ORDER BY created_at DESC
-- ===============================================================

-- 单列索引：支持 IN 子查询快速定位地址匹配的行
CREATE INDEX IF NOT EXISTS "transactions_from_address_idx" ON "transactions"("from_address");
CREATE INDEX IF NOT EXISTS "transactions_to_address_idx" ON "transactions"("to_address");

-- 复合索引：支持按代币 + 时间排序的分页查询（最常用的查询模式）
CREATE INDEX IF NOT EXISTS "transactions_token_symbol_created_at_idx" ON "transactions"("token_symbol", "created_at" DESC);

-- 复合索引：支持 wallet_subscriptions 按 wallet_id 快速查找（已有复合唯一索引前缀匹配，
-- 但单独查 wallet_id 时复合索引效率不如单列索引，加一个轻量单列索引）
CREATE INDEX IF NOT EXISTS "wallet_subscriptions_wallet_id_idx" ON "wallet_subscriptions"("wallet_id");
