import api from "./api";
import type { ChainInfo } from "../types";

/**
 * 账户服务（服务端 API 部分）。
 * 账户 CRUD 在 localAccountService 中本地处理。
 * 服务端仅保留链/资产查询和网络列表批量查询。
 */
export const accountService = {
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
