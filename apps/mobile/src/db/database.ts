import { Platform } from "react-native";
import type { DatabaseAdapter } from "./types";
import { SQLiteAdapter } from "./sqliteAdapter";
import { IndexedDBAdapter } from "./indexedDbAdapter";

/**
 * 生成 UUID（使用 Web Crypto API）。
 * 跨平台兼容（Native + Web）。
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/** 获取当前 ISO 时间字符串 */
export function nowISO(): string {
  return new Date().toISOString();
}

// ─── SQLite 建表 SQL（Native 端使用） ────────────────────────────────────────

const SQLITE_INIT_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'CREATE',
    avatar TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    password_hint TEXT NOT NULL DEFAULT '',
    mnemonic_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    chain TEXT NOT NULL,
    derivation_path TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    extended_pubkey TEXT NOT NULL DEFAULT '',
    account_index INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    server_address_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_wallet_id ON accounts(wallet_id);

  CREATE TABLE IF NOT EXISTS addresses (
    id TEXT NOT NULL DEFAULT '',
    chain TEXT NOT NULL,
    address TEXT NOT NULL,
    wallet_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'address',
    status TEXT NOT NULL DEFAULT 'unverified',
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chain, address)
  );
  CREATE INDEX IF NOT EXISTS idx_addresses_wallet_id ON addresses(wallet_id);
  CREATE INDEX IF NOT EXISTS idx_addresses_address ON addresses(address);
`;

// ─── 数据库单例 ──────────────────────────────────────────────────────────────

let adapterInstance: DatabaseAdapter | null = null;

/**
 * 获取数据库适配器单例。
 * - Native（iOS/Android）：使用 expo-sqlite
 * - Web：使用 IndexedDB
 */
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (adapterInstance) return adapterInstance;

  if (Platform.OS === "web") {
    const adapter = new IndexedDBAdapter();
    await adapter.init();
    adapterInstance = adapter;
  } else {
    // Native: 使用 expo-sqlite
    const SQLite = await import("expo-sqlite");
    const db = await SQLite.openDatabaseAsync("imwallet.db");
    const adapter = new SQLiteAdapter(db);
    // 执行建表 SQL
    const statements = SQLITE_INIT_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.execAsync(stmt);
    }
    adapterInstance = adapter;
  }

  return adapterInstance;
}