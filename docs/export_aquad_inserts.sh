#!/usr/bin/env bash
# ===============================================================
# 从 aquad_db 导出 INSERT 语句，用于导入到 imwallet
#
# 用法：在服务器上执行
#   bash export_aquad_inserts.sh
#
# 生成文件：migrate_inserts.sql
# 然后在新数据库执行：
#   psql -h localhost -U postgres -d imwallet -f migrate_inserts.sql
# ===============================================================

set -euo pipefail

DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
DB_PASS="ydyrxBsbxl@00112233"
OLD_DB="aquad_db"
OUTPUT="migrate_inserts.sql"

export PGPASSWORD="$DB_PASS"

echo "=== 从 ${OLD_DB} 导出 INSERT 语句 ==="

> "$OUTPUT"

# ─── 写入文件头 ───
cat >> "$OUTPUT" << 'HEADER'
-- IMWallet 数据迁移：aquad_db → imwallet
-- 由 export_aquad_inserts.sh 自动生成
-- 在 imwallet 数据库中执行此文件即可完成迁移
-- 所有 INSERT 使用 ON CONFLICT DO NOTHING，不覆盖已有数据

BEGIN;

HEADER

# ─── 逐表导出 INSERT 语句 ───

# 1. devices
echo "-- 1. devices" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO devices (id, platform, last_active_at, created_at, updated_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(platform) || ', ' ||
          COALESCE(quote_literal(last_active_at), 'NULL') || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ', ' ||
          COALESCE(quote_literal(updated_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM devices;" -t >> "$OUTPUT"

# 2. wallets
echo "-- 2. wallets" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO wallets (id, alias, source, created_at, updated_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(alias) || ', ' ||
          quote_literal(source) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ', ' ||
          COALESCE(quote_literal(updated_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM wallets;" -t >> "$OUTPUT"

# 3. wallets_addresses
echo "-- 3. wallets_addresses" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO wallets_addresses (id, chain, address, created_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(chain) || ', ' ||
          quote_literal(address) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM wallets_addresses;" -t >> "$OUTPUT"

# 4. assets_addresses
echo "-- 4. assets_addresses" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance, created_at, updated_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(address_id) || ', ' ||
          quote_literal(asset_id) || ', ' ||
          quote_literal(chain) || ', ' ||
          quote_literal(balance) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ', ' ||
          COALESCE(quote_literal(updated_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM assets_addresses;" -t >> "$OUTPUT"

# 5. wallet_subscriptions
echo "-- 5. wallet_subscriptions" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id, created_at) VALUES (' ||
          quote_literal(wallet_id) || ', ' ||
          quote_literal(device_id) || ', ' ||
          quote_literal(chain) || ', ' ||
          quote_literal(address_id) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ')' ||
          ' ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING;'
   FROM wallet_subscriptions;" -t >> "$OUTPUT"

# 6. transactions（新表多了 platform 列，老数据填空字符串）
echo "-- 6. transactions (platform='') " >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO transactions (id, tx_hash, from_address, to_address, token_symbol, amount, fee, status, memo, platform, created_at, updated_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(tx_hash) || ', ' ||
          quote_literal(from_address) || ', ' ||
          quote_literal(to_address) || ', ' ||
          quote_literal(token_symbol) || ', ' ||
          quote_literal(amount) || ', ' ||
          quote_literal(fee) || ', ' ||
          quote_literal(status) || ', ' ||
          quote_literal(memo) || ', ' ||
          quote_literal('') || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ', ' ||
          COALESCE(quote_literal(updated_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM transactions;" -t >> "$OUTPUT"

# 7. recharges
echo "-- 7. recharges" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO recharges (id, wallet_id, wallet_alias, account_address, token_symbol, token_name, amount, memo, device_id, platform, version, created_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(wallet_id) || ', ' ||
          quote_literal(wallet_alias) || ', ' ||
          quote_literal(account_address) || ', ' ||
          quote_literal(token_symbol) || ', ' ||
          quote_literal(token_name) || ', ' ||
          quote_literal(amount) || ', ' ||
          quote_literal(memo) || ', ' ||
          quote_literal(device_id) || ', ' ||
          quote_literal(platform) || ', ' ||
          quote_literal(version) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM recharges;" -t >> "$OUTPUT"

# 8. notifications
echo "-- 8. notifications" >> "$OUTPUT"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$OLD_DB" -c \
  "SELECT 'INSERT INTO notifications (id, wallet_id, title, content, type, created_at) VALUES (' ||
          quote_literal(id) || ', ' ||
          quote_literal(wallet_id) || ', ' ||
          quote_literal(title) || ', ' ||
          quote_literal(content) || ', ' ||
          quote_literal(type) || ', ' ||
          COALESCE(quote_literal(created_at), 'NULL') || ')' ||
          ' ON CONFLICT (id) DO NOTHING;'
   FROM notifications;" -t >> "$OUTPUT"

# ─── 写入文件尾 ───
cat >> "$OUTPUT" << 'FOOTER'

COMMIT;

-- 验证
SELECT 'devices'              AS "表", COUNT(*) AS "数量" FROM devices;
SELECT 'wallets'              AS "表", COUNT(*) AS "数量" FROM wallets;
SELECT 'wallets_addresses'    AS "表", COUNT(*) AS "数量" FROM wallets_addresses;
SELECT 'assets_addresses'     AS "表", COUNT(*) AS "数量" FROM assets_addresses;
SELECT 'wallet_subscriptions' AS "表", COUNT(*) AS "数量" FROM wallet_subscriptions;
SELECT 'transactions'         AS "表", COUNT(*) AS "数量" FROM transactions;
SELECT 'recharges'            AS "表", COUNT(*) AS "数量" FROM recharges;
SELECT 'notifications'        AS "表", COUNT(*) AS "数量" FROM notifications;
FOOTER

echo ""
echo "=== 导出完成 ==="
echo "生成文件: ${OUTPUT}"
echo "行数统计:"
wc -l "$OUTPUT"
echo ""
echo "执行迁移："
echo "  psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d imwallet -f ${OUTPUT}"
