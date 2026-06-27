-- V2: Add platform column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform VARCHAR(16) NOT NULL DEFAULT '';
