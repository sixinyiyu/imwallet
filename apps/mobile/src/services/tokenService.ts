import api from "./api";
import type { TokenBalance, TokenInfo } from "../types";
import { transactionService } from "./transactionService";

export const tokenService = {
  async getBalance(
    walletId: string
  ): Promise<{ totalBalanceCny: string; address: string }> {
    const { data } = await api.get(`/tokens/${walletId}/balance`);
    return data;
  },

  async getTokenList(
    walletId: string
  ): Promise<{ tokens: TokenBalance[] }> {
    const { data } = await api.get(`/tokens/${walletId}/list`);
    return data;
  },

  async getTokens(): Promise<{ tokens: TokenInfo[] }> {
    const { data } = await api.get("/tokens");
    return data;
  },

  async getTransactions(
    walletId: string,
    page = 1,
    limit = 5
  ): Promise<{ transactions: any[]; total: number }> {
    return transactionService.getTransactions({
      walletId,
      page,
      limit,
    });
  },
};
