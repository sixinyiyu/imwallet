-- 1. 扩容 address 列从 VarChar(42) 到 VarChar(64)（支持更长链地址如 0x.../T.../1...）
ALTER TABLE "contacts" ALTER COLUMN "address" TYPE VARCHAR(64);

-- 2. 新增 network 列（链类型：Tron/Ethereum/Bitcoin）
ALTER TABLE "contacts" ADD COLUMN "network" VARCHAR(64) NOT NULL DEFAULT 'Tron';

-- 3. 将已有的旧数据（'TRON'）统一为 PascalCase 'Tron'
UPDATE "contacts" SET "network" = 'Tron' WHERE "network" = 'TRON';
