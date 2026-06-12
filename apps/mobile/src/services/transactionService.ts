import api from "./api";
import type { Transaction } from "../types";

export interface TransactionFilter {
  walletId: string;
  page?: number;
  limit?: number;
  type?: "all" | "send" | "receive";
  timeRange?: "today" | "7d" | "30d" | "90d";
  search?: string;
}

export const transactionService = {
  async transfer(input: {
    fromWalletId: string;
    toAddress: string;
    amount: string;
    tokenId: string;
    memo?: string;
  }): Promise<Transaction> {
    const { data } = await api.post("/transactions/transfer", input);
    return data;
  },

  async getTransactions(
    filter: TransactionFilter
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const params: Record<string, string> = {
      walletId: filter.walletId,
      page: String(filter.page || 1),
      limit: String(filter.limit || 20),
    };
    if (filter.type && filter.type !== "all") params.type = filter.type;
    if (filter.timeRange) params.timeRange = filter.timeRange;
    if (filter.search) params.search = filter.search;

    const { data } = await api.get("/transactions", { params });
    return data;
  },

  async getDetail(txId: string): Promise<Transaction> {
    const { data } = await api.get(`/transactions/${txId}`);
    return data;
  },
};
