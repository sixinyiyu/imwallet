-- ============================================================
-- Migration: tokens 表新增 is_tradable 字段
-- ============================================================

ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "is_tradable" BOOLEAN NOT NULL DEFAULT true;

-- 为已有代币补充默认值
UPDATE "tokens" SET "is_tradable" = true WHERE "is_tradable" IS NULL;
