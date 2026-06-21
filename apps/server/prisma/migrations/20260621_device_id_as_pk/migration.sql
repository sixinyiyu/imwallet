-- ============================================================
-- Migration: devices 表主键改为 device_id（Ed25519 公钥 hex）
-- wallet_subscriptions / notification_reads 的 device_id 改为 VARCHAR(64)
-- ============================================================

-- 1. devices 表：移除自增 id，将 device_id 改名为 id 并设为主键
-- 1a. 删除旧的 device_id 唯一索引
DROP INDEX IF EXISTS "devices_device_id_key";
-- 1b. 删除旧的主键约束
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_pkey";
-- 1c. 删除自增 id 列
ALTER TABLE "devices" DROP COLUMN IF EXISTS "id";
-- 1d. 将 device_id 改名为 id
ALTER TABLE "devices" RENAME COLUMN "device_id" TO "id";
-- 1e. 设置 id 为主键
ALTER TABLE "devices" ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");

-- 2. wallet_subscriptions 表：device_id 从 INT 改为 VARCHAR(64)
-- 先删除旧的唯一索引
DROP INDEX IF EXISTS "wallet_subscriptions_wallet_id_device_id_chain_address_id_key";
-- 修改列类型
ALTER TABLE "wallet_subscriptions" ALTER COLUMN "device_id" TYPE VARCHAR(64);
-- 重建唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_subscriptions_wallet_id_device_id_chain_address_id_key"
  ON "wallet_subscriptions"("wallet_id", "device_id", "chain", "address_id");

-- 3. notification_reads 表：device_id 从 INT 改为 VARCHAR(64)
-- 先删除旧的唯一索引
DROP INDEX IF EXISTS "notification_reads_notification_id_device_id_idx";
-- 修改列类型
ALTER TABLE "notification_reads" ALTER COLUMN "device_id" TYPE VARCHAR(64);
-- 重建唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_notification_id_device_id_idx"
  ON "notification_reads"("notification_id", "device_id");
