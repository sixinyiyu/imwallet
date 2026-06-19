import api from "./api";
import { encryptPassword } from "./rsaService";
import type { Wallet, SimpleWallet, AggregateWallet, WalletBalanceDetail } from "../types";

export const walletService = {
  /** 获取简单钱包列表（不含代币余额） */
  async getWallets(): Promise<{ wallets: SimpleWallet[] }> {
    const { data } = await api.get("/wallets");
    return data;
  },

  /** 获取钱包列表聚合数据（含网络列表，供钱包列表页使用） */
  async getWalletsAggregate(): Promise<{ wallets: AggregateWallet[] }> {
    const { data } = await api.get("/wallets/aggregate");
    return data;
  },

  /** 获取钱包余额详情（总余额+各代币余额，切换钱包时使用） */
  async getWalletBalanceDetail(walletId: string): Promise<WalletBalanceDetail> {
    const { data } = await api.get(`/wallets/${walletId}/balance`);
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