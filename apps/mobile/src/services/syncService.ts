import api from "./api";
import type { ServerWalletAddress } from "../types";

/**
 * 同步服务：负责客户端→服务端的数据同步。
 * - 钱包注册：本地创建钱包后，同步到服务端获取 wallet.id
 * - 地址同步：本地创建账户后，同步地址到服务端 wallets_addresses
 * - 地址删除：本地删除账户后，同步删除服务端地址记录
 */
export const syncService = {
  /**
   * 在服务端注册钱包（传 source + walletId）。
   * walletId 由客户端基于助记词确定性生成，相同助记词在不同设备生成相同 ID。
   * 返回服务端创建的 wallet 记录。
   */
  async registerWallet(source: "CREATE" | "IMPORT", walletId: string, alias: string): Promise<{ id: string; source: string; createdAt: string; updatedAt: string }> {
    const { data } = await api.post("/wallets", { source, walletId, alias });
    return data;
  },

  /**
   * 同步地址到服务端 wallets_addresses 表。
   * 客户端创建账户后调用此接口。
   * 返回服务端的 addressId（用于后续更新本地 account.server_address_id）。
   */
  async syncAddress(walletId: string, chain: string, address: string): Promise<ServerWalletAddress> {
    const { data } = await api.post(`/wallets/${walletId}/addresses`, { chain, address });
    return data;
  },

  /**
   * 删除服务端的地址记录。
   * 客户端删除账户时同步调用。
   */
  async deleteAddress(walletId: string, addressId: string): Promise<void> {
    await api.delete(`/wallets/${walletId}/addresses/${addressId}`);
  },

  /**
   * 获取钱包在服务端的所有地址记录。
   */
  async getServerAddresses(walletId: string): Promise<ServerWalletAddress[]> {
    const { data } = await api.get(`/wallets/${walletId}/addresses`);
    return data.addresses;
  },

  /**
   * 删除服务端钱包（取消当前设备的订阅）。
   */
  async deleteWallet(walletId: string): Promise<void> {
    await api.delete(`/wallets/${walletId}`);
  },
};