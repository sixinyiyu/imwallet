import { getDatabase, nowISO } from "../db/database";
import type { AddressEntry } from "../types";

/** 将 DB 行转换为 AddressEntry（snake_case → camelCase） */
function rowToAddressEntry(row: Record<string, any>): AddressEntry {
  return {
    chain: row.chain,
    address: row.address,
    walletId: row.wallet_id ?? "",
    name: row.name ?? "",
    type: row.type ?? "address",
    status: row.status ?? "unverified",
    memo: row.memo ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/** 生成 addresses 表的合成 id（用于 IndexedDB keyPath） */
function makeAddressId(chain: string, address: string): string {
  return `${chain}_${address}`;
}

export const localAddressService = {
  /**
   * 插入或更新地址记录（REPLACE 策略：同一 chain+address 只保留一条）。
   * 先删除已有记录再插入，保证 upsert 语义。
   */
  async upsertAddress(data: {
    chain: string;
    address: string;
    walletId?: string;
    name?: string;
    type?: string;
    status?: string;
    memo?: string;
  }): Promise<AddressEntry> {
    const db = await getDatabase();
    const now = nowISO();
    const id = makeAddressId(data.chain, data.address);

    // 先删除已有记录（upsert 语义）
    await db.remove("addresses", { chain: data.chain, address: data.address });

    const row = {
      id,
      chain: data.chain,
      address: data.address,
      wallet_id: data.walletId ?? "",
      name: data.name ?? "",
      type: data.type ?? "address",
      status: data.status ?? "unverified",
      memo: data.memo ?? "",
      created_at: now,
      updated_at: now,
    };
    await db.insert("addresses", row);
    return rowToAddressEntry(row);
  },

  /** 查单个地址（按 chain + address） */
  async getAddress(chain: string, address: string): Promise<AddressEntry | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("addresses", {
      where: { chain, address },
    });
    return row ? rowToAddressEntry(row) : null;
  },

  /** 获取钱包的所有内部地址（type=internalWallet） */
  async getWalletInternalAddresses(walletId: string): Promise<AddressEntry[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("addresses", {
      where: { wallet_id: walletId, type: "internalWallet" },
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });
    return rows.map(rowToAddressEntry);
  },

  /** 获取所有联系人（type=contact） */
  async getAllContacts(): Promise<AddressEntry[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("addresses", {
      where: { type: "contact" },
      orderBy: [{ column: "name", dir: "ASC" }],
    });
    return rows.map(rowToAddressEntry);
  },

  /** 获取所有地址（按类型过滤） */
  async getAddressesByType(type: string): Promise<AddressEntry[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("addresses", {
      where: { type },
      orderBy: [{ column: "name", dir: "ASC" }],
    });
    return rows.map(rowToAddressEntry);
  },

  /** 跨链查地址（交易列表/转账确认页用） */
  async findByAddress(address: string): Promise<AddressEntry[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("addresses", {
      where: { address },
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });
    return rows.map(rowToAddressEntry);
  },

  /** 检查地址是否已是联系人（type=contact） */
  async isContact(chain: string, address: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("addresses", {
      where: { chain, address, type: "contact" },
    });
    return !!row;
  },

  /** 更新地址记录的部分字段（不改变 chain/address 主键） */
  async updateAddress(
    chain: string,
    address: string,
    data: Partial<{ walletId: string; name: string; type: string; status: string; memo: string }>
  ): Promise<void> {
    const db = await getDatabase();
    const updateData: Record<string, any> = { updated_at: nowISO() };
    if (data.walletId !== undefined) updateData.wallet_id = data.walletId;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.memo !== undefined) updateData.memo = data.memo;
    await db.update("addresses", updateData, { chain, address });
  },

  /** 删除地址记录 */
  async deleteAddress(chain: string, address: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("addresses", { chain, address });
  },

  /** 删除钱包关联的所有地址 */
  async deleteWalletAddresses(walletId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("addresses", { wallet_id: walletId });
  },
};
