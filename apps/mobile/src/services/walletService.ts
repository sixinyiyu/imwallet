import api from "./api";
import { encryptPassword } from "./rsaService";
import type { Wallet } from "../types";

export const walletService = {
  async getWallets(): Promise<{ wallets: Wallet[] }> {
    const { data } = await api.get("/wallets");
    return data;
  },

  async getWalletDetail(walletId: string): Promise<Wallet> {
    const { data } = await api.get(`/wallets/${walletId}`);
    return data;
  },

  /** 创建/导入钱包（统一接口，通过 source 区分） */
  async saveWallet(
    source: "CREATE" | "IMPORT",
    alias: string,
    password: string,
    passwordHint?: string,
    mnemonic?: string,
  ): Promise<Wallet> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.post("/wallets", {
      source,
      alias,
      password: encryptedPassword,
      passwordHint: passwordHint || undefined,
      mnemonic,
    });
    return data;
  },

  /** 重置钱包密码（通过助记词验证身份后更新密码） */
  async resetPassword(
    walletId: string,
    mnemonic: string,
    password: string,
    passwordHint?: string,
  ): Promise<Wallet> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.put(`/wallets/${walletId}/reset-password`, {
      mnemonic,
      password: encryptedPassword,
      passwordHint: passwordHint || undefined,
    });
    return data;
  },

  async deleteWallet(walletId: string): Promise<void> {
    await api.delete(`/wallets/${walletId}`);
  },

  async backupWallet(walletId: string): Promise<void> {
    await api.put(`/wallets/${walletId}/backup`);
  },

  async updateWalletAlias(walletId: string, alias: string): Promise<Wallet> {
    const { data } = await api.put(`/wallets/${walletId}`, { alias });
    return data;
  },

  /** 验证钱包密码 */
  async verifyWalletPassword(walletId: string, password: string): Promise<boolean> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.post(`/wallets/${walletId}/verify-password`, {
      password: encryptedPassword,
    });
    return data.verified;
  },

  /** 订阅钱包到当前设备 */
  async subscribeWallet(walletId: string): Promise<void> {
    await api.post("/devices/wallets", { wallet_id: walletId });
  },

  /** 取消订阅钱包 */
  async unsubscribeWallet(walletId: string): Promise<void> {
    await api.delete(`/devices/wallets/${walletId}`);
  },
};
