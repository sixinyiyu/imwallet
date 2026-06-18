-- ============================================================
-- Migration: 移除 accounts 表 address 列的全局唯一约束
-- 
-- 变更内容：
--   accounts.address 不再全局唯一，改为 (wallet_id, network) 唯一
--   允许不同钱包在不同网络使用相同地址
-- ============================================================

DROP INDEX IF EXISTS "accounts_address_key";
