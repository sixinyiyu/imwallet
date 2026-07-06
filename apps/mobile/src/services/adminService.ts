import api from "./api";
import { getEncryptedPassword, getAdminRoutePrefix } from "../utils/adminAuthCache";

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
     const prefix = await getAdminRoutePrefix();
     if (!prefix) throw new Error("管理路由前缀未获取，请先通过反馈验证");
     const { data } = await api.post(`/${prefix}/devices`, { encryptedPassword });    return (data || []).map(mapDeviceItem);
  },

  /** 获取钱包列表（POST，含关联设备+余额，需 device_auth + RSA加密管理密码，分页） */
  async listWallets(password: string, page: number = 1, limit: number = 10): Promise<{ wallets: WalletAdminInfo[]; total: number; page: number; limit: number }> {
    const encryptedPassword = await getEncryptedPassword(password);
     const prefix = await getAdminRoutePrefix();
     if (!prefix) throw new Error("管理路由前缀未获取，请先通过反馈验证");
     const { data } = await api.post(`/${prefix}/wallets`, { encryptedPassword, page, limit });    return {
      wallets: (data.wallets || []).map(mapWalletAdminItem),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },

  /** 获取设备详情（POST，需 device_auth + RSA加密管理密码） */
  async getDeviceDetail(deviceId: string, password: string): Promise<DeviceDetail> {
    const encryptedPassword = await getEncryptedPassword(password);
     const prefix = await getAdminRoutePrefix();
     if (!prefix) throw new Error("管理路由前缀未获取，请先通过反馈验证");
     const { data } = await api.post(`/${prefix}/devices/${deviceId}`, { encryptedPassword });    return {
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

  /** 获取钱包交易记录（POST，分页，需 device_auth + RSA加密管理密码） */
  async getWalletTransactions(walletId: string, password: string, page: number = 1, limit: number = 20): Promise<{ transactions: WalletTransaction[]; total: number; page: number; limit: number }> {
    const encryptedPassword = await getEncryptedPassword(password);
    const prefix = await getAdminRoutePrefix();
    if (!prefix) throw new Error("管理路由前缀未获取，请先通过反馈验证");
    const { data } = await api.post(`/${prefix}/wallets/${walletId}/transactions`, { encryptedPassword, page, limit });
    return {
      transactions: (data.transactions || []).map(mapWalletTransaction),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },

  /** 获取充值记录（POST，分页，需 device_auth + RSA加密管理密码）
   *  不传 walletId 时返回所有充值记录；传 walletId 时按钱包过滤
   */
  async getRechargeRecords(password: string, page: number = 1, limit: number = 10, walletId?: string): Promise<{ recharges: WalletRecharge[]; total: number; page: number; limit: number }> {
    const encryptedPassword = await getEncryptedPassword(password);
    const prefix = await getAdminRoutePrefix();
    if (!prefix) throw new Error("管理路由前缀未获取，请先通过反馈验证");
    const body: Record<string, unknown> = { encryptedPassword, page, limit };
    if (walletId) body.walletId = walletId;
    const { data } = await api.post(`/${prefix}/recharges`, body);
    return {
      recharges: (data.recharges || []).map(mapWalletRecharge),
      total: data.total || 0,
      page: data.page || page,
      limit: data.limit || limit,
    };
  },
};