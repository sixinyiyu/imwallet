import api from "./api";
import type { Account, ChainInfo } from "../types";

export const accountService = {
  async getWalletAccounts(walletId: string): Promise<{ accounts: Account[] }> {
    const { data } = await api.get(`/accounts/wallets/${walletId}/accounts`);
    return data;
  },

  async createAccount(
    walletId: string,
    network: string,
    name?: string,
    mnemonic?: string,
    allowMultiAccount?: boolean
  ): Promise<{ accounts: Account[] }> {
    const { data } = await api.post(`/accounts/wallets/${walletId}/accounts`, {
      network,
      name,
      mnemonic,
      allowMultiAccount,
    });
    return data;
  },

  async getAccountDetail(accountId: string): Promise<Account> {
    const { data } = await api.get(`/accounts/accounts/${accountId}`);
    return data;
  },

  async deleteAccount(accountId: string): Promise<void> {
    await api.delete(`/accounts/accounts/${accountId}`);
  },

  /** 获取支持创建账户的链列表 */
  async getAvailableChains(): Promise<{ chains: ChainInfo[] }> {
    const { data } = await api.get("/accounts/chains/available");
    return data;
  },

  /** 批量获取多个钱包的账户网络列表（去重） */
  async getWalletsNetworksBatch(walletIds: string[]): Promise<{ wallets: Array<{ walletId: string; networks: string[] }> }> {
    const { data } = await api.get("/accounts/wallets/networks/batch", {
      params: { walletIds: walletIds.join(",") },
    });
    return data;
  },
};