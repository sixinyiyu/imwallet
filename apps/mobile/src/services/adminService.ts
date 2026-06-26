import api from "./api";

export interface DeviceInfo {
  id: string;
  platform: string;
  online: boolean;
  walletCount: number;
  lastActiveAt: string | null;
  createdAt: string | null;
}

export interface DeviceDetail {
  id: string;
  platform: string;
  online: boolean;
  lastActiveAt: string | null;
  createdAt: string | null;
  wallets: Array<{
    walletId: string;
    alias: string;
    source: string;
    chain: string;
    address: string;
  }>;
}

export interface DeviceTransaction {
  id: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  tokenSymbol: string;
  amount: string;
  fee: string;
  status: string;
  memo: string;
  createdAt: string;
}

export interface DeviceRecharge {
  id: string;
  walletId: string;
  walletAlias: string;
  accountAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  memo: string;
  createdAt: string;
}

export const adminService = {
  /** 获取设备列表（POST，需 device_auth + 管理密码） */
  async listDevices(password: string): Promise<DeviceInfo[]> {
    const { data } = await api.post("/admin/devices", { password });
    return (data || []).map((d: any) => ({
      id: d.id,
      platform: d.platform,
      online: d.online,
      walletCount: d.walletCount ?? d.wallet_count ?? 0,
      lastActiveAt: d.lastActiveAt ?? d.last_active_at ?? null,
      createdAt: d.createdAt ?? d.created_at ?? null,
    }));
  },

  /** 获取设备详情（POST，需 device_auth + 管理密码） */
  async getDeviceDetail(deviceId: string, password: string): Promise<DeviceDetail> {
    const { data } = await api.post(`/admin/devices/${deviceId}`, { password });
    return {
      id: data.id,
      platform: data.platform,
      online: data.online,
      lastActiveAt: data.lastActiveAt ?? data.last_active_at ?? null,
      createdAt: data.createdAt ?? data.created_at ?? null,
      wallets: (data.wallets || []).map((w: any) => ({
        walletId: w.walletId ?? w.wallet_id,
        alias: w.alias,
        source: w.source,
        chain: w.chain,
        address: w.address,
      })),
    };
  },

  /** 获取设备交易记录（POST，需 device_auth + 管理密码） */
  async getDeviceTransactions(deviceId: string, password: string, offset: number = 0): Promise<DeviceTransaction[]> {
    const { data } = await api.post(`/admin/devices/${deviceId}/transactions`, { password, offset });
    return (data || []).map((t: any) => ({
      id: t.id,
      txHash: t.txHash ?? t.tx_hash,
      fromAddress: t.fromAddress ?? t.from_address,
      toAddress: t.toAddress ?? t.to_address,
      tokenSymbol: t.tokenSymbol ?? t.token_symbol,
      amount: String(t.amount ?? "0"),
      fee: String(t.fee ?? "0"),
      status: t.status,
      memo: t.memo ?? "",
      createdAt: t.createdAt ?? t.created_at ?? "",
    }));
  },

  /** 获取设备充值记录（POST，需 device_auth + 管理密码） */
  async getDeviceRecharges(deviceId: string, password: string, offset: number = 0): Promise<DeviceRecharge[]> {
    const { data } = await api.post(`/admin/devices/${deviceId}/recharges`, { password, offset });
    return (data || []).map((r: any) => ({
      id: r.id,
      walletId: r.walletId ?? r.wallet_id,
      walletAlias: r.walletAlias ?? r.wallet_alias,
      accountAddress: r.accountAddress ?? r.account_address,
      tokenSymbol: r.tokenSymbol ?? r.token_symbol,
      tokenName: r.tokenName ?? r.token_name,
      amount: String(r.amount ?? "0"),
      memo: r.memo ?? "",
      createdAt: r.createdAt ?? r.created_at ?? "",
    }));
  },
};
