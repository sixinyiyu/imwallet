import api from "./api";
import type { AssetInfo } from "../types";
import { transactionService } from "./transactionService";

export const assetService = {
  async getAssets(): Promise<{ assets: AssetInfo[] }> {
    const { data } = await api.get("/assets");
    return data;
  },

  /** 切换资产交易开关 */
  async updateAssetTradable(assetId: string, isTradable: boolean): Promise<{ id: string; symbol: string; isTradable: boolean }> {
    const { data } = await api.put(`/assets/${assetId}/tradable`, { isTradable });
    return data;
  },

  async getTransactions(
    walletId: string,
    page = 1,
    limit = 5,
    tokenSymbol?: string
  ): Promise<{ transactions: any[]; total: number }> {
    return transactionService.getTransactions({
      walletId,
      page,
      limit,
      tokenSymbol,
    });
  },
};