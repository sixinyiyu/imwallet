-- ============================================================
-- Migration: 移除 wallets 表的 is_backed_up 字段
-- 备份状态改为纯客户端管理（SecureStore），服务端不再存储
-- ============================================================

ALTER TABLE "wallets" DROP COLUMN IF EXISTS "is_backed_up";
