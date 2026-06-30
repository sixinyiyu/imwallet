import "react-native-get-random-values";
import { sha256 } from "@noble/hashes/sha2.js";
import { getDatabase, nowISO } from "../db/database";
import type { LocalWallet } from "../types";

/** 将字节数组转为 hex 字符串 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 计算密码的 SHA-256 hex 哈希 */
export function hashPassword(password: string): string {
  const data = new TextEncoder().encode(password);
  return bytesToHex(sha256(data));
}

/** 将 DB 行转换为 LocalWallet（布尔值 0/1 → true/false） */
function rowToWallet(row: Record<string, any>): LocalWallet {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    sort_order: row.sort_order,
    is_pinned: row.is_pinned === 1 || row.is_pinned === true,
    source: row.source,
    avatar: row.avatar,
    password_hash: row.password_hash,
    password_hint: row.password_hint,
    mnemonic_hash: row.mnemonic_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const localWalletService = {
  async getAllWallets(): Promise<LocalWallet[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("wallets", {
      orderBy: [
        { column: "is_pinned", dir: "DESC" },
        { column: "sort_order", dir: "ASC" },
      ],
    });
    return rows.map(rowToWallet);
  },

  async getWalletById(id: string): Promise<LocalWallet | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("wallets", { where: { id } });
    return row ? rowToWallet(row) : null;
  },

  async createWallet(data: {
    id: string;
    name: string;
    source: string;
    password_hash: string;
    password_hint: string;
    mnemonic_hash: string;
  }): Promise<LocalWallet> {
    const db = await getDatabase();
    const now = nowISO();
    await db.insert("wallets", {
      id: data.id,
      name: data.name,
      type: "",
      sort_order: 0,
      is_pinned: 0,
      source: data.source,
      avatar: "",
      password_hash: data.password_hash,
      password_hint: data.password_hint,
      mnemonic_hash: data.mnemonic_hash,
      created_at: now,
      updated_at: now,
    });
    return {
      id: data.id,
      name: data.name,
      type: "",
      sort_order: 0,
      is_pinned: false,
      source: data.source,
      avatar: "",
      password_hash: data.password_hash,
      password_hint: data.password_hint,
      mnemonic_hash: data.mnemonic_hash,
      created_at: now,
      updated_at: now,
    };
  },

  async updateWallet(
    id: string,
    data: Partial<{
      name: string;
      sort_order: number;
      is_pinned: boolean;
      avatar: string;
      password_hash: string;
      password_hint: string;
    }>
  ): Promise<void> {
    const db = await getDatabase();
    const updateData: Record<string, any> = { updated_at: nowISO() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
    if (data.is_pinned !== undefined) updateData.is_pinned = data.is_pinned ? 1 : 0;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.password_hash !== undefined) updateData.password_hash = data.password_hash;
    if (data.password_hint !== undefined) updateData.password_hint = data.password_hint;

    await db.update("wallets", updateData, { id });
  },

  async deleteWallet(id: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("accounts", { wallet_id: id });
    await db.remove("addresses", { wallet_id: id });
    await db.remove("wallets", { id });
  },

  async verifyPassword(id: string, password: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.selectOne<LocalWallet>("wallets", {
      where: { id },
    });
    if (!row) return false;
    // 只读订阅钱包没有密码，直接返回 false
    const wallet = rowToWallet(row);
    if (wallet.source === "SUBSCRIBE") return false;
    if (!wallet.password_hash) return false;
    return hashPassword(password) === wallet.password_hash;
  },

  async verifyMnemonicHash(id: string, mnemonicHash: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.selectOne<{ mnemonic_hash: string }>("wallets", {
      where: { id },
    });
    if (!row || !row.mnemonic_hash) return false;
    return mnemonicHash === row.mnemonic_hash;
  },

  async updatePassword(id: string, newPasswordHash: string, passwordHint?: string): Promise<void> {
    const db = await getDatabase();
    const updateData: Record<string, any> = {
      password_hash: newPasswordHash,
      updated_at: nowISO(),
    };
    if (passwordHint !== undefined) {
      updateData.password_hint = passwordHint;
    }
    await db.update("wallets", updateData, { id });
  },
};