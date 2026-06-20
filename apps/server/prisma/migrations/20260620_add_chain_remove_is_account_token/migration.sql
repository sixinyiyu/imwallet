-- ============================================================
-- Migration: 新增 chains 表 + 移除 tokens.is_account_token
-- ============================================================

-- 新增 chains 表
CREATE TABLE IF NOT EXISTS "chains" (
    "id"                   SERIAL      NOT NULL,
    "name"                 VARCHAR(64) NOT NULL,
    "display_name"         VARCHAR(64) NOT NULL,
    "is_account_supported" BOOLEAN     NOT NULL DEFAULT true,
    "derivation_path"      VARCHAR(128),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chains_name_key" ON "chains"("name");

-- chains 种子数据
INSERT INTO "chains" ("name", "display_name", "is_account_supported", "derivation_path")
VALUES
    ('Tron',     'Tron (TRX)',     true, 'm/44''/195''/0''/0'),
    ('Ethereum', 'Ethereum (ETH)', true, 'm/44''/60''/0''/0'),
    ('Bitcoin',  'Bitcoin (BTC)',  true, 'm/44''/0''/0''/0')
ON CONFLICT ("name") DO NOTHING;

-- 移除 tokens.is_account_token 列
ALTER TABLE "tokens" DROP COLUMN IF EXISTS "is_account_token";
