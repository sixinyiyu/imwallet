-- 彻底清空所有表和类型，用于完全重建
DROP TABLE IF EXISTS notifications, notification_reads, transactions, assets_addresses, wallets_addresses, wallet_subscriptions, wallets, assets, chains, devices, fiat_currencies, app_configs, recharges, app_logs, _migrations CASCADE;
DROP TYPE IF EXISTS "WalletSource", "TxStatus", "UserStatus", "UserRole", "NotificationType", "Platform" CASCADE;
