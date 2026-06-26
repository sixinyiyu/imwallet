import api from "./api";

export interface DeviceInfo {
  id: string;
  platform: string;
  online: boolean;
  walletCount: number;
  lastActiveAt: string | null;
  createdAt: string | null;
}

export interface DeviceBrief {
  id: string;
  platform: string;
  online: boolean;
}

export interface WalletAdminInfo {
  id: string;
  alias: string;
  source: string;
  chains: string[];
  deviceCount: number;
  devices: DeviceBrief[];
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

export interface WalletTransaction {
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

export interface WalletRecharge {
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
      walletCount: d.walletCount ?? 0,
      lastActiveAt: d.lastActiveAt ?? null,
      createdAt: d.createdAt ?? null,
    }));
  },

  /** 获取钱包列表（POST，含关联设备，需 device_auth + 管理密码） */
  async listWallets(password: string): Promise<WalletAdminInfo[]> {
    const { data } = await api.post("/admin/wallets", { password });
    return (data || []).map((w: any) => ({
      id: w.id,
      alias: w.alias,
      source: w.source,
      chains: w.chains ?? [],
      deviceCount: w.deviceCount ?? 0,
      devices: (w.devices ?? []).map((d: any) => ({
        id: d.id,
        platform: d.platform,
        online: d.online,
      })),
      createdAt: w.createdAt ?? null,
    }));
  },

  /** 获取设备详情（POST，需 device_auth + 管理密码） */
  async getDeviceDetail(deviceId: string, password: string): Promise<DeviceDetail> {
    const { data } = await api.post(`/admin/devices/${deviceId}`, { password });
    return {
      id: data.id,
      platform: data.platform,
      online: data.online,
      lastActiveAt: data.lastActiveAt ?? null,
      createdAt: data.createdAt ?? null,
      wallets: (data.wallets || []).map((w: any) => ({
        walletId: w.walletId,
        alias: w.alias,
        source: w.source,
        chain: w.chain,
        address: w.address,
      })),
    };
  },

  /** 获取钱包交易记录（POST，需 device_auth + 管理密码） */
  async getWalletTransactions(walletId: string, password: string, offset: number = 0): Promise<WalletTransaction[]> {
    const { data } = await api.post(`/admin/wallets/${walletId}/transactions`, { password, offset });
    return (data || []).map((t: any) => ({
      id: t.id,
      txHash: t.txHash,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      tokenSymbol: t.tokenSymbol,
      amount: String(t.amount ?? "0"),
      fee: String(t.fee ?? "0"),
      status: t.status,
      memo: t.memo ?? "",
      createdAt: t.createdAt ?? "",
    }));
  },

  /** 获取钱包充值记录（POST，需 device_auth + 管理密码） */
  async getWalletRecharges(walletId: string, password: string, offset: number = 0): Promise<WalletRecharge[]> {
    const { data } = await api.post(`/admin/wallets/${walletId}/recharges`, { password, offset });
    return (data || []).map((r: any) => ({
      id: r.id,
      walletId: r.walletId,
      walletAlias: r.walletAlias,
      accountAddress: r.accountAddress,
      tokenSymbol: r.tokenSymbol,
      tokenName: r.tokenName,
      amount: String(r.amount ?? "0"),
      memo: r.memo ?? "",
      createdAt: r.createdAt ?? "",
    }));
  },
};
