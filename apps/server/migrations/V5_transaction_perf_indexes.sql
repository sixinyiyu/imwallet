-- ===============================================================
-- IMWallet / rs-wallet - 交易列表查询性能优化索引
-- CTE + UNION ALL 方案需要以下复合索引才能高效执行
-- ===============================================================

-- 交易列表按发送方地址+代币+时间排序（CTE IN-list scan）
CREATE INDEX IF NOT EXISTS transactions_from_addr_symbol_created_idx
    ON transactions(from_address, token_symbol, created_at DESC);

-- 交易列表按接收方地址+代币+时间排序（CTE IN-list scan）
CREATE INDEX IF NOT EXISTS transactions_to_addr_symbol_created_idx
    ON transactions(to_address, token_symbol, created_at DESC);

-- 余额查询 JOIN 加速（assets_addresses 按 address_id 查找）
CREATE INDEX IF NOT EXISTS assets_addresses_address_id_idx
    ON assets_addresses(address_id);

-- 钱包余额查询 JOIN 加速（wallet_subscriptions 复合索引）
CREATE INDEX IF NOT EXISTS wallet_subscriptions_wallet_id_address_id_idx
    ON wallet_subscriptions(wallet_id, address_id);
