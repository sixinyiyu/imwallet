import api from "./api";
import type { Account, TokenInfo } from "../types";

export const accountService = {
  async getWalletAccounts(walletId: string): Promise<{ accounts: Account[] }> {
    const { data } = await api.get(`/accounts/wallets/${walletId}/accounts`);
    return data;
  },

  async createAccount(
    walletId: string,
    tokenId: string,
    name?: string,
    mnemonic?: string
  ): Promise<Account> {
    const { data } = await api.post(`/accounts/wallets/${walletId}/accounts`, {
      tokenId,
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

  async getAvailableTokens(): Promise<{ tokens: TokenInfo[] }> {
    const { data } = await api.get("/accounts/tokens/available");
    return data;
  },
};