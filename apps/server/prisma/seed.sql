-- ============================================================
-- IMWallet Seed Script (Pure SQL, Zero Dependencies)
-- 用法: psql $DATABASE_URL -v seed_password="'YOUR_PASSWORD'" -f seed.sql
-- 示例: psql "$DATABASE_URL" -v seed_password="'MySecret123'" -f seed.sql
-- ============================================================

-- 启用 pgcrypto 扩展（bcrypt 需要）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 验证密码参数
DO $$
BEGIN
  IF current_setting('server_version_num')::int IS NOT NULL THEN
    -- just a sanity check that we can execute DO blocks
    RAISE NOTICE 'PostgreSQL connection OK';
  END IF;
END $$;

BEGIN;

-- ============================================================
-- 1. 创建/更新 damotou 用户 (ADMIN 角色, 已激活)
-- ============================================================
INSERT INTO "users" ("id", "username", "password_hash", "device_info", "status", "role", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'damotou',
  crypt(:seed_password, gen_salt('bf', 12)),   -- bcrypt hash, 等价于 Node.js bcrypt.hash(pwd, 12)
  '',
  'ACTIVE',
  'ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT ("username") DO UPDATE
SET
  "password_hash" = EXCLUDED."password_hash",
  "status"        = 'ACTIVE',
  "role"          = 'ADMIN',
  "deleted_at"    = NULL,
  "updated_at"    = NOW();

-- ============================================================
-- 2. 创建代币 USDT / TRX (幂等)
-- ============================================================
INSERT INTO "tokens" ("id", "symbol", "name", "decimals", "network", "is_active", "created_at", "updated_at")
VALUES
  ('token-usdt-default', 'USDT', 'Tether USD', 6, 'Tron', true, NOW(), NOW()),
  ('token-trx-default',  'TRX',  'Tron',       6, 'Tron', true, NOW(), NOW())
ON CONFLICT ("symbol") DO NOTHING;

-- ============================================================
-- 3. 为 damotou 创建钱包
-- ============================================================
INSERT INTO "wallets" ("id", "identifier", "alias", "address", "source", "is_backed_up", "password", "memo", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'aqud' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 32),
  '主钱包',
  '0xDAMOTOU00000000000000000000000000000001',
  'CREATE',
  false,
  '',
  '种子数据-内置钱包',
  NOW(),
  NOW()
)
ON CONFLICT ("address") DO NOTHING;

-- ============================================================
-- 4. 设置钱包代币余额 (USDT: 90000000, TRX: 100000)
-- ============================================================
INSERT INTO "wallet_tokens" ("id", "wallet_id", "token_id", "balance", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  w."id",
  'token-usdt-default',
  90000000,
  NOW(),
  NOW()
FROM "wallets" w
WHERE w."address" = '0xDAMOTOU00000000000000000000000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM "wallet_tokens" wt
    WHERE wt."wallet_id" = w."id" AND wt."token_id" = 'token-usdt-default'
  );

-- 更新 USDT 余额（如果已存在）
UPDATE "wallet_tokens"
SET "balance" = 90000000, "updated_at" = NOW()
WHERE "token_id" = 'token-usdt-default'
  AND "wallet_id" = (SELECT "id" FROM "wallets" WHERE "address" = '0xDAMOTOU00000000000000000000000000000001');

INSERT INTO "wallet_tokens" ("id", "wallet_id", "token_id", "balance", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  w."id",
  'token-trx-default',
  100000,
  NOW(),
  NOW()
FROM "wallets" w
WHERE w."address" = '0xDAMOTOU00000000000000000000000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM "wallet_tokens" wt
    WHERE wt."wallet_id" = w."id" AND wt."token_id" = 'token-trx-default'
  );

-- 更新 TRX 余额（如果已存在）
UPDATE "wallet_tokens"
SET "balance" = 100000, "updated_at" = NOW()
WHERE "token_id" = 'token-trx-default'
  AND "wallet_id" = (SELECT "id" FROM "wallets" WHERE "address" = '0xDAMOTOU00000000000000000000000000000001');

-- ============================================================
-- 5. 关联 damotou 与钱包
-- ============================================================
INSERT INTO "user_wallets" ("id", "user_id", "wallet_id", "is_active", "created_at")
SELECT
  gen_random_uuid(),
  u."id",
  w."id",
  true,
  NOW()
FROM "users" u, "wallets" w
WHERE u."username" = 'damotou'
  AND w."address" = '0xDAMOTOU00000000000000000000000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM "user_wallets" uw
    WHERE uw."user_id" = u."id" AND uw."wallet_id" = w."id"
  );

-- 如果已存在则激活
UPDATE "user_wallets" uw
SET "is_active" = true
FROM "users" u, "wallets" w
WHERE u."username" = 'damotou'
  AND w."address" = '0xDAMOTOU00000000000000000000000000000001'
  AND uw."user_id" = u."id"
  AND uw."wallet_id" = w."id";

-- ============================================================
-- 6. 法币汇率数据
-- ============================================================
INSERT INTO "fiat_currencies" ("id", "code", "name", "symbol", "rate", "decimals", "updated_at")
VALUES
  (gen_random_uuid(), 'USD', 'US Dollar',       '$', 1.0,    2, NOW()),
  (gen_random_uuid(), 'CNY', '人民币',           '¥', 7.25,   2, NOW()),
  (gen_random_uuid(), 'EUR', 'Euro',             '€', 0.92,   2, NOW()),
  (gen_random_uuid(), 'JPY', 'Japanese Yen',     '¥', 155.0,  0, NOW())
ON CONFLICT ("code") DO UPDATE
SET "rate" = EXCLUDED."rate", "updated_at" = NOW();

-- ============================================================
-- 7. 确保 admin 用户角色为 ADMIN
-- ============================================================
UPDATE "users"
SET "role" = 'ADMIN', "updated_at" = NOW()
WHERE "username" = 'admin'
  AND "deleted_at" IS NULL
  AND "role" != 'ADMIN';

-- ============================================================
-- 8. 其他用户角色设为 NORMAL（排除 admin 和 damotou）
-- ============================================================
UPDATE "users"
SET "role" = 'NORMAL', "updated_at" = NOW()
WHERE "username" NOT IN ('admin', 'damotou')
  AND "deleted_at" IS NULL
  AND "role" = 'ADMIN';

COMMIT;

-- 输出结果
DO $$
DECLARE
  v_user_count  INT;
  v_token_count INT;
  v_wallet_count INT;
  v_fiat_count  INT;
BEGIN
  SELECT COUNT(*) INTO v_user_count  FROM "users" WHERE "username" = 'damotou';
  SELECT COUNT(*) INTO v_token_count FROM "tokens" WHERE "symbol" IN ('USDT', 'TRX');
  SELECT COUNT(*) INTO v_wallet_count FROM "wallets" WHERE "address" = '0xDAMOTOU00000000000000000000000000000001';
  SELECT COUNT(*) INTO v_fiat_count  FROM "fiat_currencies";

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  🌱 Seed Results';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  damotou user:   %', v_user_count;
  RAISE NOTICE '  tokens:         %', v_token_count;
  RAISE NOTICE '  wallet:         %', v_wallet_count;
  RAISE NOTICE '  fiat currencies: %', v_fiat_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '  🎉 Seed complete!';
  RAISE NOTICE '========================================';
END $$;
