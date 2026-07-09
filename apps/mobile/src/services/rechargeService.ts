import api from "./api";
import Constants from "expo-constants";
import { getAdminRoutePrefix, getEncryptedPassword } from "../utils/adminAuthCache";

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
  tokenSymbol?: string;
}

export const rechargeService = {
  /** 充值 — POST /{prefix}/wallets/{walletId}/recharges（仅需 device_auth + 白名单，不需要管理密码） */
  async recharge(input: {
    walletId: string;
    walletAlias: string;
    tokenSymbol: string;
    network: string;
    accountAddress: string;
    amount: string;
    memo?: string;
  }): Promise<RechargeRecord> {
    const prefix = await getAdminRoutePrefix();
    if (!prefix) throw new Error("路由前缀未获取，请先通过反馈验证");
    const { data } = await api.post(`/${prefix}/wallets/${input.walletId}/recharges`, {
      walletAlias: input.walletAlias,
      tokenSymbol: input.tokenSymbol,
      network: input.network,
      accountAddress: input.accountAddress,
      amount: input.amount,
      memo: input.memo,
    }, {
      headers: { "x-app-version": Constants.expoConfig?.version || "unknown" },
    });
    return data;
  },
  /** 查询全部充值记录 — GET /recharges（仅需 device_auth + 白名单，不做设备过滤）
   *  支持按 wallet_id / time_range 筛选
   *  time_range: "today" / "7d" / "30d" / "90d"，后端内部转换为 timestamp */
  async getAllRechargeRecords(
    page: number = 1,
    limit: number = 20,
    filters?: { walletId?: string; timeRange?: string },
  ): Promise<{ recharges: RechargeRecord[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { page, limit };
    if (filters?.walletId) params.wallet_id = filters.walletId;
    if (filters?.timeRange) params.time_range = filters.timeRange;
    const { data } = await api.get("/recharges", { params });
    return {
      recharges: (data.recharges || []).map(mapRechargeItem),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },

  /** 查询充值记录 — POST /{prefix}/recharges（需 RSA 加密管理密码，分页） */
  async getRechargeRecords(password: string, page: number = 1, limit: number = 10, walletId?: string): Promise<{ recharges: RechargeRecord[]; total: number; page: number; limit: number }> {
    const prefix = await getAdminRoutePrefix();
    if (!prefix) throw new Error("路由前缀未获取，请先通过反馈验证");
    const encryptedPassword = await getEncryptedPassword(password);
    const body: Record<string, unknown> = { encryptedPassword, page, limit };
    if (walletId) body.walletId = walletId;
    const { data } = await api.post(`/${prefix}/recharges`, body);
    return {
      recharges: (data.recharges || []).map(mapRechargeItem),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },
};

function mapRechargeItem(r: any): RechargeRecord {
  return {
    id: r.id ?? "",
    walletId: r.walletId ?? r.wallet_id ?? "",
    walletAlias: r.walletAlias ?? r.wallet_alias ?? "",
    accountAddress: r.accountAddress ?? r.account_address ?? "",
    tokenSymbol: r.tokenSymbol ?? r.token_symbol ?? "",
    tokenName: r.tokenName ?? r.token_name ?? "",
    amount: String(r.amount ?? "0"),
    memo: r.memo ?? "",
    deviceId: r.deviceId ?? r.device_id ?? "",
    platform: r.platform ?? "",
    version: r.version ?? "",
    createdAt: r.createdAt ?? r.created_at ?? "",
  };
}