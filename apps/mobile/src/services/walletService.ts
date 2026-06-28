import api from "./api";
import type { Wallet, SimpleWallet, AggregateWallet, WalletBalanceDetail, ServerWalletAddress, AssetBalance } from "../types";

function mapAssetBalance(item: any): AssetBalance {
  return {
    id: item.assetId || "",
    assetId: item.assetId || "",
    symbol: item.symbol || "",
    name: item.name || "",
    balance: String(item.balance ?? "0"),
    usdValue: String(item.usdValue ?? "0"),
    cnyValue: String(item.cnyValue ?? "0"),
    decimals: item.decimals ?? 6,
    type: item.type || "NATIVE",
    chain: item.chain || "",
    tokenId: item.tokenId || null,
    iconUrl: item.iconUrl || undefined,
  };
}

/**
 * 钱包服务（服务端 API 部分）。
 * 密码验证、助记词哈希等在 localWalletService 中本地处理。
 * 钱包别名、排序等本地字段在 localWalletService 中管理。
 */
export const walletService = {
  /** 获取简单钱包列表（服务端视角，不含本地字段）
   *  后端返回字段 alias，前端 SimpleWallet 用 name，此处做映射 */
  async getWallets(): Promise<{ wallets: SimpleWallet[] }> {
    const { data } = await api.get("/wallets");
    const wallets: SimpleWallet[] = (data.wallets || []).map((w: any) => ({
      id: w.id,
      name: w.alias || "",
      source: w.source || "",
      type: "",
      sortOrder: 0,
      isPinned: false,
      avatar: "",
      passwordHint: "",
      createdAt: "",
    }));
    return { wallets };
  },

  /** 获取所有系统钱包（搜索+分页，供充值管理等场景使用）
   *  后端返回字段 alias，前端 SimpleWallet 用 name，此处做映射 */
  async getAllWallets(params: { search?: string; page?: number; limit?: number }): Promise<{ wallets: SimpleWallet[]; total: number }> {
    const query: Record<string, string> = {};
    if (params.search) query.search = params.search;
    if (params.page) query.page = String(params.page);
    if (params.limit) query.limit = String(params.limit);
    const { data } = await api.get("/wallets/all", { params: query });
    const wallets: SimpleWallet[] = (data.wallets || []).map((w: any) => ({
      id: w.id,
      name: w.alias || "",
      source: w.source || "",
      type: "",
      sortOrder: 0,
      isPinned: false,
      avatar: "",
      passwordHint: "",
      createdAt: w.createdAt || "",
    }));
    return { wallets, total: data.total || 0 };
  },

  /** 获取钱包列表聚合数据（含网络列表） */
  async getWalletsAggregate(): Promise<{ wallets: AggregateWallet[] }> {
    const { data } = await api.get("/wallets/aggregate");
    return data;
  },

  async getWalletBalanceDetail(walletId: string): Promise<WalletBalanceDetail> {
    const { data } = await api.get(`/wallets/${walletId}/balance`);
    return {
      totalBalanceUsd: String(data.totalBalanceUsd ?? "0"),
      totalBalanceCny: String(data.totalBalanceCny ?? "0"),
      assets: (data.assets || []).map(mapAssetBalance),
    };
  },

  async getWalletDetail(walletId: string): Promise<Wallet> {
    const { data } = await api.get(`/wallets/${walletId}`);
    return {
      id: data.id,
      name: data.alias || "",
      source: data.source || "",
      type: "",
      sortOrder: 0,
      isPinned: false,
      avatar: "",
      passwordHint: "",
      createdAt: data.createdAt || "",
      updatedAt: data.updatedAt || "",
      tokenBalances: (data.tokenBalances || []).map(mapAssetBalance),
      totalBalanceCny: String(data.totalBalanceCny ?? "0"),
    };
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