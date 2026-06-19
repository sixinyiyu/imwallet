-- 1. 新增 from_address 列（先允许 NULL，后面填充数据后再设 NOT NULL）
ALTER TABLE "transactions" ADD COLUMN "from_address" VARCHAR(64);

-- 2. 新增 token_symbol 列（先允许 NULL）
ALTER TABLE "transactions" ADD COLUMN "token_symbol" VARCHAR(16);

-- 3. 从 wallets 表填充 from_address（使用 wallet.address 作为链地址）
UPDATE "transactions" t
SET "from_address" = w.address
FROM "wallets" w
WHERE t."from_wallet_id" = w.id;

-- 4. 从 tokens 表填充 token_symbol
UPDATE "transactions" t
SET "token_symbol" = tk.symbol
FROM "tokens" tk
WHERE t."token_id" = tk.id;

-- 5. 对仍无 from_address 的记录（钱包被删除等异常），用 wallet_id 截断填充兜底
UPDATE "transactions"
SET "from_address" = LEFT("from_wallet_id", 10)
WHERE "from_address" IS NULL;

-- 6. 对仍无 token_symbol 的记录（代币被删除等异常），用 'UNKNOWN' 兜底
UPDATE "transactions"
SET "token_symbol" = 'UNKNOWN'
WHERE "token_symbol" IS NULL;

-- 7. 设置 NOT NULL 约束
ALTER TABLE "transactions" ALTER COLUMN "from_address" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "token_symbol" SET NOT NULL;

-- 8. 删除旧的 token_id 列
ALTER TABLE "transactions" DROP COLUMN "token_id";
