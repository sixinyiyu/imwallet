-- V3: Add metadata JSONB column to notifications table
-- Stores lightweight display hints: { transaction_id, token_symbol, chain, amount }
-- Only for transaction notifications; other types default to '{}'
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
