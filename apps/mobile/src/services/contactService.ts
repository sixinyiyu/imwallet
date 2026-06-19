import api from "./api";
import type { Contact } from "../types";

export const contactService = {
  async getContacts(): Promise<Contact[]> {
    const { data } = await api.get("/contacts");
    return data.contacts;
  },
  async createContact(contact: {
    name: string;
    address: string;
    network?: string;
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