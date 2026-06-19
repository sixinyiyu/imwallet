import api from "./api";
import type { Contact } from "../types";

export const contactService = {
  async getContacts(): Promise<Contact[]> {
    const { data } = await api.get("/contacts");
    return data.contacts;
  },

  /** 根据钱包地址查找是否存在于系统 */
  async lookupAddress(address: string): Promise<boolean> {
    const { data } = await api.get("/contacts/lookup", {
      params: { address },
    });
    return !!data.exists;
  },

  async createContact(contact: {
    name: string;
    address: string;
    network: string;
    memo?: string;
  }): Promise<Contact> {
    const { data } = await api.post("/contacts", contact);
    return data;
  },

  async updateContact(
    id: string,
    contact: { name?: string; address?: string; network?: string; memo?: string }
  ): Promise<Contact> {
    const { data } = await api.put(`/contacts/${id}`, contact);
    return data;
  },

  async deleteContact(id: string): Promise<void> {
    await api.delete(`/contacts/${id}`);
  },
};
