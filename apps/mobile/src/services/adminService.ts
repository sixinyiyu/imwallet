import api from "./api";
import { getEncryptedPassword } from "../utils/adminAuthCache";

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

export interface AssetBalanceBrief {
  assetId: string;
  symbol: string;
  name: string;
  chain: string;
  iconUrl: string;
  balance: string;
  cnyValue: string;
}

export interface WalletAdminInfo {
  id: string;
  alias: string;
  source: string;
  chains: string[];
  deviceCount: number;
  devices: DeviceBrief[];
  totalBalanceCny: string;
  assets: AssetBalanceBrief[];
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
  platform: string;
  createdAt: string;
  memo: string;
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

// ── API 响应类型（camelCase，因为 api 拦截器已自动转换 snake_case → camelCase） ──

interface ApiDeviceItem {
  id: string;
  platform: string;
  online: boolean;
  walletCount?: number;
  lastActiveAt?: string | null;
  createdAt?: string | null;
}

interface ApiDeviceBrief {
  id: string;
  platform: string;
  online: boolean;
}

interface ApiAssetBalanceBrief {
  assetId?: string;
  symbol?: string;
  name?: string;
  chain?: string;
  iconUrl?: string;
  balance?: string;
  cnyValue?: string;
}

interface ApiWalletAdminItem {
  id: string;
  alias: string;
  source: string;
  chains?: string[];
  deviceCount?: number;
  devices?: ApiDeviceBrief[];
  totalBalanceCny?: string;
  assets?: ApiAssetBalanceBrief[];
  createdAt?: string | null;
}

interface ApiWalletTransaction {
  id: string;
  txHash?: string;
  fromAddress?: string;
  toAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  fee?: string;
  platform?: string;
  createdAt?: string;
  memo?: string;
}

interface ApiWalletRecharge {
  id: string;
  walletId?: string;
  walletAlias?: string;
  accountAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  amount?: string;
  memo?: string;
  createdAt?: string;
}

// ── 映射函数（api 拦截器已转为 camelCase，直接读取 camelCase 字段） ──

function mapDeviceItem(d: ApiDeviceItem): DeviceInfo {
  return {
    id: d.id,
    platform: d.platform,
    online: d.online,
    walletCount: d.walletCount ?? 0,
    lastActiveAt: d.lastActiveAt ?? null,
    createdAt: d.createdAt ?? null,
  };
}

function mapWalletAdminItem(w: ApiWalletAdminItem): WalletAdminInfo {
  return {
    id: w.id,
    alias: w.alias,
    source: w.source,
    chains: w.chains ?? [],
    deviceCount: w.deviceCount ?? 0,
    devices: (w.devices ?? []).map((d: ApiDeviceBrief) => ({
      id: d.id,
      platform: d.platform,
      online: d.online,
    })),
    totalBalanceCny: w.totalBalanceCny ?? "0",
    assets: (w.assets ?? []).map((a: ApiAssetBalanceBrief) => ({
      assetId: a.assetId ?? "",
      symbol: a.symbol ?? "",
      name: a.name ?? "",
      chain: a.chain ?? "",
      iconUrl: a.iconUrl ?? "",
      balance: String(a.balance ?? "0"),
      cnyValue: String(a.cnyValue ?? "0"),
    })),
    createdAt: w.createdAt ?? null,
  };
}

function mapWalletTransaction(t: ApiWalletTransaction): WalletTransaction {
  return {
    id: t.id,
    txHash: t.txHash ?? "",
    fromAddress: t.fromAddress ?? "",
    toAddress: t.toAddress ?? "",
    tokenSymbol: t.tokenSymbol ?? "",
    amount: String(t.amount ?? "0"),
    fee: String(t.fee ?? "0"),
    platform: t.platform ?? "",
    createdAt: t.createdAt ?? "",
    memo: t.memo ?? "",
  };
}

function mapWalletRecharge(r: ApiWalletRecharge): WalletRecharge {
  return {
    id: r.id,
    walletId: r.walletId ?? "",
    walletAlias: r.walletAlias ?? "",
    accountAddress: r.accountAddress ?? "",
    tokenSymbol: r.tokenSymbol ?? "",
    tokenName: r.tokenName ?? "",
    amount: String(r.amount ?? "0"),
    memo: r.memo ?? "",
    createdAt: r.createdAt ?? "",
  };
}

export const adminService = {
  /** 获取设备列表（POST，需 device_auth + RSA加密管理密码） */
  async listDevices(password: string): Promise<DeviceInfo[]> {
    const encryptedPassword = await getEncryptedPassword(password);
    const { data } = await api.post("/admin/devices", { encryptedPassword });
    return (data || []).map(mapDeviceItem);
  },

  /** 获取钱包列表（POST，含关联设备+余额，需 device_auth + RSA加密管理密码，分页） */
  async listWallets(password: string, page: number = 1, limit: number = 10): Promise<{ wallets: WalletAdminInfo[]; total: number; page: number; limit: number }> {
    const encryptedPassword = await getEncryptedPassword(password);
    const { data } = await api.post("/admin/wallets", { encryptedPassword, page, limit });
    return {
      wallets: (data.wallets || []).map(mapWalletAdminItem),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },

  /** 获取设备详情（POST，需 device_auth + RSA加密管理密码） */
  async getDeviceDetail(deviceId: string, password: string): Promise<DeviceDetail> {
    const encryptedPassword = await getEncryptedPassword(password);
    const { data } = await api.post(`/admin/devices/${deviceId}`, { encryptedPassword });
    return {
      id: data.id,
      platform: data.platform,
      online: data.online,
      lastActiveAt: data.lastActiveAt ?? null,
      createdAt: data.createdAt ?? null,
      wallets: (data.wallets || []).map((w: { walletId: string; alias: string; source: string; chain: string; address: string }) => ({
        walletId: w.walletId,
        alias: w.alias,
        source: w.source,
        chain: w.chain,
        address: w.address,
      })),
    };
  },

  /** 获取钱包交易记录（POST，需 device_auth + RSA加密管理密码） */
  async getWalletTransactions(walletId: string, password: string, offset: number = 0): Promise<WalletTransaction[]> {
    const encryptedPassword = await getEncryptedPassword(password);
    const { data } = await api.post(`/admin/wallets/${walletId}/transactions`, { encryptedPassword, offset });
    return (data || []).map(mapWalletTransaction);
  },

  /** 获取钱包充值记录（POST，需 device_auth + RSA加密管理密码） */
  async getWalletRecharges(walletId: string, password: string, offset: number = 0): Promise<WalletRecharge[]> {
    const encryptedPassword = await getEncryptedPassword(password);
    const { data } = await api.post(`/admin/wallets/${walletId}/recharges`, { encryptedPassword, offset });
    return (data || []).map(mapWalletRecharge);
  },
};