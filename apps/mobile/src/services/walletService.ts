import api from "./api";
import type { Wallet, SimpleWallet, AggregateWallet, WalletBalanceDetail, ServerWalletAddress } from "../types";

/**
 * 钱包服务（服务端 API 部分）。
 * 密码验证、助记词哈希等在 localWalletService 中本地处理。
 * 钱包别名、排序等本地字段在 localWalletService 中管理。
 */
export const walletService = {
  /** 获取简单钱包列表（服务端视角，不含本地字段） */
  async getWallets(): Promise<{ wallets: SimpleWallet[] }> {
    const { data } = await api.get("/wallets");
    return data;
  },

  /** 获取所有系统钱包（搜索+分页，供充值管理等场景使用） */
  async getAllWallets(params: { search?: string; page?: number; limit?: number }): Promise<{ wallets: SimpleWallet[]; total: number }> {
    const query: Record<string, string> = {};
    if (params.search) query.search = params.search;
    if (params.page) query.page = String(params.page);
    if (params.limit) query.limit = String(params.limit);
    const { data } = await api.get("/wallets/all", { params: query });
    return data;
  },

  /** 获取钱包列表聚合数据（含网络列表） */
  async getWalletsAggregate(): Promise<{ wallets: AggregateWallet[] }> {
    const { data } = await api.get("/wallets/aggregate");
    return data;
  },

  /** 获取钱包余额详情（总余额+各资产余额） */
  async getWalletBalanceDetail(walletId: string): Promise<WalletBalanceDetail> {
    const { data } = await api.get(`/wallets/${walletId}/balance`);
    return data;
  },

  /** 获取钱包详情（含余额信息） */
  async getWalletDetail(walletId: string): Promise<Wallet> {
    const { data } = await api.get(`/wallets/${walletId}`);
    return data;
  },

  /** 获取钱包的所有链上地址（服务端视角，供充值管理等场景使用） */
  async getWalletAddresses(walletId: string): Promise<{ addresses: ServerWalletAddress[] }> {
    const { data } = await api.get(`/wallets/${walletId}/addresses`);
    return data;
  },

  /** 删除钱包（服务端取消订阅） */
  async deleteWallet(walletId: string): Promise<void> {
    await api.delete(`/wallets/${walletId}`);
  },

  /** 订阅钱包到当前设备 */
  async subscribeWallet(walletId: string): Promise<void> {
    await api.post("/devices/wallets", { walletId });
  },

  /** 取消订阅钱包 */
  async unsubscribeWallet(walletId: string): Promise<void> {
    await api.delete(`/devices/wallets/${walletId}`);
  },
};