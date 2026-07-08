import "react-native-get-random-values";
import { getDatabase, nowISO } from "../db/database";
import type { LocalWallet } from "../types";
import {
  pbkdf2Hex,
  sha256Hex,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_PASSWORD,
  PBKDF2_SALT_MNEMONIC,
} from "../utils/crypto";

// ── 哈希版本 ──
// v1: SHA-256（旧版，兼容已创建钱包的密码和助记词哈希）
// v2: PBKDF2-SHA256（新版，更安全）

/** 计算密码的 PBKDF2-SHA256 hex 哈希（v2）
 *  所有平台均为异步，需要 await */
export async function hashPassword(password: string): Promise<string> {
  return pbkdf2Hex(password, PBKDF2_SALT_PASSWORD, PBKDF2_ITERATIONS, 32, "sha256");
}

/** 计算助记词的 PBKDF2-SHA256 hex 哈希（v2）
 *  所有平台均为异步，需要 await */
export async function hashMnemonic(mnemonic: string): Promise<string> {
  return pbkdf2Hex(mnemonic, PBKDF2_SALT_MNEMONIC, PBKDF2_ITERATIONS, 32, "sha256");
}

/** 计算的 SHA-256 hex 哈希（v1 旧版，用于兼容验证）
 *  Web 环境下为异步，需要 await */
function hashLegacy(input: string): string | Promise<string> {
  return sha256Hex(input);
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

  /**
   * 验证密码 — 支持 v1/v2 双版本哈希，v1 匹配时自动升级为 v2
   */
  async verifyPassword(id: string, password: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.selectOne<LocalWallet>("wallets", {
      where: { id },
    });
    if (!row) return false;
    const wallet = rowToWallet(row);
    if (wallet.source === "SUBSCRIBE") return false;
    if (!wallet.password_hash) return false;

    // 先尝试 PBKDF2 v2 哈希
    const v2Hash = await hashPassword(password);
    if (v2Hash === wallet.password_hash) return true;

    // 兼容旧版 SHA-256 v1 哈希
    const v1Hash = await hashLegacy(password);
    if (v1Hash === wallet.password_hash) {
      // 自动升级：旧哈希验证成功后，更新为 PBKDF2 v2 哈希
      await this.updatePassword(id, v2Hash);
      return true;
    }

    return false;
  },

  /**
   * 验证助记词哈希 — 支持 v1/v2 双版本哈希，v1 匹配时自动升级为 v2
   *
   * 旧版钱包 mnemonic_hash 用 SHA-256(v1) 存储，
   * 新版钱包用 PBKDF2-SHA256(v2) 存储。
   * 此方法先尝试 v2 匹配，再尝试 v1 匹配，v1 匹配时自动升级。
   */
  async verifyMnemonicHash(id: string, mnemonic: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.selectOne<{ mnemonic_hash: string }>("wallets", {
      where: { id },
    });
    if (!row || !row.mnemonic_hash) return false;

    const storedHash = row.mnemonic_hash;

    // 先尝试 PBKDF2 v2 哈希
    const v2Hash = await hashMnemonic(mnemonic);
    if (v2Hash === storedHash) return true;

    // 兼容旧版 SHA-256 v1 哈希
    const v1Hash = await hashLegacy(mnemonic);
    if (v1Hash === storedHash) {
      // 自动升级：旧哈希验证成功后，更新为 PBKDF2 v2 哈希
      await this.updateMnemonicHash(id, v2Hash);
      return true;
    }

    return false;
  },

  async updateMnemonicHash(id: string, newMnemonicHash: string): Promise<void> {
    const db = await getDatabase();
    await db.update("wallets", { mnemonic_hash: newMnemonicHash, updated_at: nowISO() }, { id });
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