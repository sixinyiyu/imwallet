import api from "./api";
import type { Wallet } from "../types";

export const walletService = {
  async getWallets(): Promise<{ wallets: Wallet[] }> {
    const { data } = await api.get("/wallets");
    return data;
  },

  async createWallet(alias: string): Promise<Wallet> {
    const { data } = await api.post("/wallets", { alias });
    return data;
  },

  async activateWallet(walletId: string): Promise<void> {
    await api.put(`/wallets/${walletId}/activate`);
  },

  async deleteWallet(walletId: string): Promise<void> {
    await api.delete(`/wallets/${walletId}`);
  },
};
