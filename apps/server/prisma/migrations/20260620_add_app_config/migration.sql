-- ============================================================
-- Migration: 创建 app_configs 表（key-value 字典表），存储系统级配置
-- ============================================================

CREATE TABLE IF NOT EXISTS "app_configs" (
    "id"         SERIAL      NOT NULL,
    "key"        VARCHAR(64) NOT NULL,
    "value"      VARCHAR(256) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_configs_key_key" ON "app_configs"("key");

-- 种子数据：服务配置密码 + 费率配置
INSERT INTO "app_configs" ("key", "value")
VALUES
    ('server_pwd', 'ydyrxBsbxl@'),
    ('fee_rate', '0.005'),
    ('fee_mode', 'DEDUCTED'),
    ('tx_restrict_wallet', 'false')
ON CONFLICT ("key") DO NOTHING;