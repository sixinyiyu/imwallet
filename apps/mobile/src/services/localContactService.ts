import { getDatabase, generateUUID, nowISO } from "../db/database";
import type { Contact, ContactAddress } from "../types";

/** 将 DB 行转换为 ContactAddress */
function rowToContactAddress(row: Record<string, any>): ContactAddress {
  return {
    id: row.id,
    contactId: row.contact_id,
    chain: row.chain,
    address: row.address,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

export const localContactService = {
  async getAllContacts(): Promise<Contact[]> {
    const db = await getDatabase();
    const contactRows = await db.selectAll<Record<string, any>>("contacts", {
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });
    if (contactRows.length === 0) return [];

    const addressRows = await db.selectAll<Record<string, any>>("contacts_addresses", {
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });

    const addressMap = new Map<string, ContactAddress[]>();
    for (const row of addressRows) {
      const addr = rowToContactAddress(row);
      const list = addressMap.get(row.contact_id) ?? [];
      list.push(addr);
      addressMap.set(row.contact_id, list);
    }

    return contactRows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      memo: row.memo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      addresses: addressMap.get(row.id) ?? [],
    }));
  },

  async getContactById(id: string): Promise<Contact | null> {
    const db = await getDatabase();
    const contactRow = await db.selectOne<Record<string, any>>("contacts", { where: { id } });
    if (!contactRow) return null;

    const addressRows = await db.selectAll<Record<string, any>>("contacts_addresses", {
      where: { contact_id: id },
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });

    return {
      id: contactRow.id,
      name: contactRow.name,
      avatar: contactRow.avatar,
      memo: contactRow.memo,
      createdAt: contactRow.created_at,
      updatedAt: contactRow.updated_at,
      addresses: addressRows.map(rowToContactAddress),
    };
  },

  async createContact(data: { name: string; avatar?: string; memo?: string }): Promise<Contact> {
    const db = await getDatabase();
    const id = generateUUID();
    const now = nowISO();
    await db.insert("contacts", {
      id,
      name: data.name,
      avatar: data.avatar ?? "",
      memo: data.memo ?? "",
      created_at: now,
      updated_at: now,
    });
    return {
      id,
      name: data.name,
      avatar: data.avatar ?? "",
      memo: data.memo ?? "",
      createdAt: now,
      updatedAt: now,
      addresses: [],
    };
  },

  async updateContact(id: string, data: Partial<{ name: string; avatar: string; memo: string }>): Promise<void> {
    const db = await getDatabase();
    const updateData: Record<string, any> = { updated_at: nowISO() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.memo !== undefined) updateData.memo = data.memo;
    await db.update("contacts", updateData, { id });
  },

  async deleteContact(id: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("contacts_addresses", { contact_id: id });
    await db.remove("contacts", { id });
  },

  async addContactAddress(contactId: string, data: { chain: string; address: string; memo?: string }): Promise<ContactAddress> {
    const db = await getDatabase();
    const id = generateUUID();
    const now = nowISO();
    await db.insert("contacts_addresses", {
      id,
      contact_id: contactId,
      chain: data.chain,
      address: data.address,
      memo: data.memo ?? "",
      created_at: now,
    });
    return {
      id,
      contactId,
      chain: data.chain,
      address: data.address,
      memo: data.memo ?? "",
      createdAt: now,
    };
  },

  async deleteContactAddress(addressId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("contacts_addresses", { id: addressId });
  },

  async findContactsByAddress(address: string): Promise<Contact[]> {
    const db = await getDatabase();
    // 使用子查询：查找 contacts_addresses 中 address 匹配的联系人 ID
    const contactRows = await db.selectBySubQuery<Record<string, any>>(
      "contacts",
      "id",
      "contacts_addresses",
      "contact_id",
      { address },
      [{ column: "created_at", dir: "ASC" }]
    );
    if (contactRows.length === 0) return [];

    // 批量获取这些联系人的地址
    const contactIds = contactRows.map((c) => c.id);
    const allAddressRows = await db.selectAll<Record<string, any>>("contacts_addresses", {
      orderBy: [{ column: "created_at", dir: "ASC" }],
    });

    const addressMap = new Map<string, ContactAddress[]>();
    for (const row of allAddressRows) {
      if (contactIds.includes(row.contact_id)) {
        const addr = rowToContactAddress(row);
        const list = addressMap.get(row.contact_id) ?? [];
        list.push(addr);
        addressMap.set(row.contact_id, list);
      }
    }

    return contactRows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      memo: row.memo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      addresses: addressMap.get(row.id) ?? [],
    }));
  },
};
