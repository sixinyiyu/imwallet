-- ===============================================================
-- IMWallet / rs-wallet - 补充关键索引
-- Driven by flyway 0.7 MigrationRunner, executed as V4
-- Idempotent: all statements can be safely re-executed
-- ===============================================================

-- 交易按代币+时间过滤（交易列表页按代币筛选时使用）
CREATE INDEX IF NOT EXISTS transactions_token_symbol_created_at_idx
    ON transactions(token_symbol, created_at DESC);

-- 通知按钱包+时间排序（通知列表页增量同步时使用）
CREATE INDEX IF NOT EXISTS notifications_wallet_id_created_at_idx
    ON notifications(wallet_id, created_at DESC);

-- 设备订阅按设备ID查询（获取设备钱包列表时使用）
CREATE INDEX IF NOT EXISTS wallet_subscriptions_device_id_idx
    ON wallet_subscriptions(device_id);
