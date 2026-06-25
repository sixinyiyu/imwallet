-- V2: Only Tron should have account_enable = true by default
-- Ethereum and Bitcoin are disabled until explicitly enabled by admin

UPDATE "chains"
SET "account_enable" = false
WHERE "name" IN ('Ethereum', 'Bitcoin')
  AND "account_enable" = true;
