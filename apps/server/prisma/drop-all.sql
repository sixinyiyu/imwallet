-- ============================================================
-- IMWallet Database Reset Script
-- 清空所有表 + 删除枚举类型 + 删除迁移记录
-- 重置后重新执行 init.sql 即可完整重建
-- ⚠️ 此操作不可逆！仅用于开发环境数据库重建
-- ============================================================

-- 删除所有数据表（无外键约束，顺序无关紧要）
DROP TABLE IF EXISTS "notification_reads" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "app_logs" CASCADE;
DROP TABLE IF EXISTS "recharges" CASCADE;
DROP TABLE IF EXISTS "app_configs" CASCADE;
DROP TABLE IF EXISTS "fiat_currencies" CASCADE;
DROP TABLE IF EXISTS "transactions" CASCADE;
DROP TABLE IF EXISTS "assets_addresses" CASCADE;
DROP TABLE IF EXISTS "wallets_addresses" CASCADE;
DROP TABLE IF EXISTS "wallet_subscriptions" CASCADE;
DROP TABLE IF EXISTS "assets" CASCADE;
DROP TABLE IF EXISTS "chains" CASCADE;
DROP TABLE IF EXISTS "wallets" CASCADE;
DROP TABLE IF EXISTS "devices" CASCADE;
DROP TABLE IF EXISTS "_migrations" CASCADE;

-- 删除所有枚举类型
DROP TYPE IF EXISTS "WalletSource" CASCADE;
DROP TYPE IF EXISTS "TxStatus" CASCADE;
DROP TYPE IF EXISTS "NotificationType" CASCADE;
DROP TYPE IF EXISTS "Platform" CASCADE;

-- 完成！重新执行 init.sql 即可重建所有表和种子数据
