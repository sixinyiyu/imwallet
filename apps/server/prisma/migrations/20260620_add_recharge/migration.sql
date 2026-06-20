-- ============================================================
-- Migration: 新增充值记录表 + recharge_allowed_devices 配置种子
-- ============================================================

-- 充值记录表
CREATE TABLE IF NOT EXISTS "recharges" (
    "id"             TEXT        NOT NULL,
    "wallet_id"      VARCHAR(36) NOT NULL,
    "wallet_alias"   VARCHAR(64) NOT NULL,
    "wallet_address" VARCHAR(64) NOT NULL,
    "token_symbol"   VARCHAR(16) NOT NULL,
    "token_name"     VARCHAR(64) NOT NULL,
    "amount"         DECIMAL(30,8) NOT NULL,
    "memo"           VARCHAR(256) NOT NULL DEFAULT '',
    "device_id"      VARCHAR(64) NOT NULL,
    "platform"       VARCHAR(16) NOT NULL,
    "version"        VARCHAR(32),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharges_pkey" PRIMARY KEY ("id")
);

-- 充值允许设备列表配置种子
INSERT INTO "app_configs" ("key", "value")
VALUES ('recharge_allowed_devices', '[]')
ON CONFLICT ("key") DO NOTHING;
