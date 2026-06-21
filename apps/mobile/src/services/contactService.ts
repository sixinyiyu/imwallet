import { localContactService } from "./localContactService";
import type { Contact, ContactAddress } from "../types";

/**
 * 联系人服务（完全本地化，使用 SQLite）。
 * 联系人数据不离开设备，不同步到服务端。
 */
export const contactService = {
  /** 获取所有联系人（含多链地址） */
  async getContacts(): Promise<Contact[]> {
    return localContactService.getAllContacts();
  },

  /** 创建联系人 */
  async createContact(contact: { name: string; avatar?: string; memo?: string }): Promise<Contact> {
    return localContactService.createContact(contact);
  },

  /** 更新联系人 */
  async updateContact(id: string, contact: { name?: string; avatar?: string; memo?: string }): Promise<void> {
    return localContactService.updateContact(id, contact);
  },

  /** 删除联系人 */
  async deleteContact(id: string): Promise<void> {
    return localContactService.deleteContact(id);
  },

  /** 添加联系人地址 */
  async addContactAddress(contactId: string, data: { chain: string; address: string; memo?: string }): Promise<ContactAddress> {
    return localContactService.addContactAddress(contactId, data);
  },

  /** 删除联系人地址 */
  async deleteContactAddress(addressId: string): Promise<void> {
    return localContactService.deleteContactAddress(addressId);
  },

  /** 通过地址查找联系人 */
  async findContactsByAddress(address: string): Promise<Contact[]> {
    return localContactService.findContactsByAddress(address);
  },
};
