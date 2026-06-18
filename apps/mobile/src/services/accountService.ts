import api from "./api";
import type { Account, TokenInfo } from "../types";

export interface AvailableNetwork {
  network: string;
  tokens: TokenInfo[];
}

export const accountService = {
  async getWalletAccounts(walletId: string): Promise<{ accounts: Account[] }> {
    const { data } = await api.get(`/accounts/wallets/${walletId}/accounts`);
    return data;
  },

  async createAccount(
    walletId: string,
    network: string,
    name?: string,
    mnemonic?: string
  ): Promise<Account> {
    const { data } = await api.post(`/accounts/wallets/${walletId}/accounts`, {
      network,
      name,
      mnemonic,
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

  /** 获取可创建账户的网络列表（只含 isAccountToken=true 的代币） */
  async getAvailableNetworks(): Promise<{ networks: AvailableNetwork[] }> {
    const { data } = await api.get("/accounts/networks/available");
    return data;
  },
};
