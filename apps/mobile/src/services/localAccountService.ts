import { getDatabase, nowISO } from "../db/database";
import type { Account } from "../types";

/** 将 DB 行转换为 Account（snake_case → camelCase） */
function rowToAccount(row: Record<string, any>): Account {
  return {
    id: row.id,
    walletId: row.wallet_id,
    chain: row.chain,
    derivationPath: row.derivation_path,
    address: row.address,
    extendedPubkey: row.extended_pubkey,
    accountIndex: row.account_index,
    name: row.name,
    serverAddressId: row.server_address_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const localAccountService = {
  /** 获取所有账户（一次性查询，用于批量分组） */
  async getAllAccounts(): Promise<Account[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("accounts", {
      orderBy: [{ column: "account_index", dir: "ASC" }],
    });
    return rows.map(rowToAccount);
  },

  async getWalletAccounts(walletId: string): Promise<Account[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("accounts", {
      where: { wallet_id: walletId },
      orderBy: [{ column: "account_index", dir: "ASC" }],
    });
    return rows.map(rowToAccount);
  },

  async getAccountById(id: string): Promise<Account | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("accounts", { where: { id } });
    return row ? rowToAccount(row) : null;
  },

  async createAccount(data: {
    id: string;
    wallet_id: string;
    chain: string;
    derivation_path: string;
    address: string;
    extended_pubkey: string;
    account_index: number;
    name: string;
    server_address_id: string;
  }): Promise<Account> {
    const db = await getDatabase();
    const now = nowISO();
    await db.insert("accounts", {
      id: data.id,
      wallet_id: data.wallet_id,
      chain: data.chain,
      derivation_path: data.derivation_path,
      address: data.address,
      extended_pubkey: data.extended_pubkey,
      account_index: data.account_index,
      name: data.name,
      server_address_id: data.server_address_id,
      created_at: now,
      updated_at: now,
    });
    return {
      id: data.id,
      walletId: data.wallet_id,
      chain: data.chain,
      derivationPath: data.derivation_path,
      address: data.address,
      extendedPubkey: data.extended_pubkey,
      accountIndex: data.account_index,
      name: data.name,
      serverAddressId: data.server_address_id,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateAccount(id: string, data: Partial<{ name: string; server_address_id: string }>): Promise<void> {
    const db = await getDatabase();
    const updateData: Record<string, any> = { updated_at: nowISO() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.server_address_id !== undefined) updateData.server_address_id = data.server_address_id;
    await db.update("accounts", updateData, { id });
  },

  async deleteAccount(id: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("accounts", { id });
  },

  async getAccountByAddress(address: string): Promise<Account | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("accounts", { where: { address } });
    return row ? rowToAccount(row) : null;
  },

  async getMaxAccountIndex(walletId: string, chain: string): Promise<number> {
    const db = await getDatabase();
    const maxVal = await db.max("accounts", "account_index", { wallet_id: walletId, chain });
    return maxVal ?? -1;
  },
};