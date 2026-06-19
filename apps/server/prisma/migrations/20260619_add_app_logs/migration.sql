-- ============================================================
-- Migration: 创建 app_logs 表，存储客户端崩溃和关键业务失败日志
-- ============================================================

CREATE TABLE "app_logs" (
  "id"         SERIAL PRIMARY KEY,
  "device_id"  VARCHAR(64),
  "platform"   VARCHAR(16),
  "version"    VARCHAR(32),
  "log_type"   VARCHAR(32) NOT NULL,
  "content"    TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
