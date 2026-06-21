import api from "./api";
import Constants from "expo-constants";

export interface RechargeRecord {
  id: string;
  walletId: string;
  walletAlias: string;
  accountAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  memo: string;
  deviceId: string;
  platform: string;
  version: string;
  createdAt: string;
}

export interface RechargeParams {
  page?: number;
  limit?: number;
  walletId?: string;
  tokenSymbol?: string;
}

export const rechargeService = {
  /** 充值 */
  async recharge(input: {
    walletId: string;
    walletAlias: string;
    tokenSymbol: string;
    network: string;
    accountAddress: string;
    amount: string;
    memo?: string;
  }): Promise<RechargeRecord> {
    const { data } = await api.post("/recharges", input, {
      headers: { "x-app-version": Constants.expoConfig?.version || "unknown" },
    });
    return data;
  },

  /** 查询充值记录列表 */
  async getRecharges(params: RechargeParams = {}): Promise<{ recharges: RechargeRecord[]; total: number }> {
    const query: Record<string, string> = {};
    if (params.page) query.page = String(params.page);
    if (params.limit) query.limit = String(params.limit);
    if (params.walletId) query.walletId = params.walletId;
    if (params.tokenSymbol) query.tokenSymbol = params.tokenSymbol;
    const { data } = await api.get("/recharges", { params: query });
    return data;
  },
};