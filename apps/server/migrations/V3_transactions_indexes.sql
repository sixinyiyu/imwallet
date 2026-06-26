-- ===============================================================
-- IMWallet / rs-wallet - V3: transactions index optimization
-- ===============================================================

-- 移除无检索场景的 tx_hash 唯一索引（tx_hash 由 SHA-256 + UUID 生成，天然唯一）
DROP INDEX IF EXISTS "transactions_tx_hash_key";

-- 复合索引：地址 + 时间 DESC
-- 高基数列 (address) 提供良好的选择性，时间排序内嵌索引避免额外 sort
-- 覆盖 CTE 查询中 IN 子查询 + ORDER BY created_at DESC + LIMIT/OFFSET
CREATE INDEX IF NOT EXISTS "transactions_from_address_created_at_idx" ON "transactions"("from_address", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "transactions_to_address_created_at_idx" ON "transactions"("to_address", "created_at" DESC);

-- wallet_subscriptions 单列索引：补充复合唯一索引前缀，更轻量
CREATE INDEX IF NOT EXISTS "wallet_subscriptions_wallet_id_idx" ON "wallet_subscriptions"("wallet_id");
