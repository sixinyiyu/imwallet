/** 服务端返回的精简设备信息 */
export interface ServerDevice {
  id: number;
  deviceId: string;
  platform: string;
  createdAt: string;
  updatedAt: string;
}

/** 本地钱包主表 */
export interface LocalWallet {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  is_pinned: boolean;
  source: string;
  avatar: string;
  password_hash: string;
  password_hint: string;
  mnemonic_hash: string;
  created_at: string;
  updated_at: string;
}

/** 简单钱包信息（供 UI 使用） */
export interface SimpleWallet {
  id: string;
  name: string;
  source: string;
  type: string;
  sortOrder: number;
  isPinned: boolean;
  avatar: string;
  passwordHint: string;
  createdAt: string;
  /** 只读订阅标记：source=SUBSCRIBE 时为 true */
  isReadOnly?: boolean;
}

/** 聚合钱包信息（含网络列表，供钱包列表页使用） */
export interface AggregateWallet extends SimpleWallet {
  networks: string[];
}

/** 钱包余额详情（总余额+各代币余额，切换钱包时使用） */
export interface WalletBalanceDetail {
  totalBalanceUsd: string;
  totalBalanceCny: string;
  assets: AssetBalance[];
}

/** 钱包详情（含余额信息） */
export interface Wallet extends SimpleWallet {
  updatedAt?: string;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}

/** 本地派生账户 */
export interface Account {
  id: string;
  walletId: string;
  chain: string;
  derivationPath: string;
  address: string;
  extendedPubkey: string;
  accountIndex: number;
  name: string;
  serverAddressId: string;
  createdAt: string;
  updatedAt?: string;
}

/** 地址元信息 */
export interface AddressInfo {
  id: string;
  chain: string;
  address: string;
  walletId: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface WalletTokenBalance {
  id: string;
  tokenId: string;
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
  network: string;
  iconUrl?: string;
}

export interface AssetBalance {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
  type: string;
  chain: string;
  tokenId?: string | null;
  iconUrl?: string;
}

export interface AssetInfo {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  chain: string;
  type: string;
  tokenId?: string | null;
  iconUrl?: string;
  isActive: boolean;
  isDefault: boolean;
  isTradable: boolean;
}

export interface ChainInfo {
  id: number;
  name: string;
  displayName: string;
  accountEnable: boolean;
  derivationPath: string;
  assets: Array<{
    id: string;
    symbol: string;
    name: string;
    type: string;
    decimals: number;
    tokenId?: string | null;
    isDefault: boolean;
  }>;
}

export interface Transaction {
  id: string;
  fromAddress: string;
  toAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  amount: string;
  fee: string;
  receivedAmount?: string;
  feeMode?: string;
  status: string;
  memo: string | null;
  createdAt: string;
  fromWallet?: { alias: string; address: string };
  toWallet?: { alias: string; address: string };
  fromContactName?: string;
  toContactName?: string;
}

/** 地址簿条目（全局地址通讯录，PK = chain + address） */
export interface AddressEntry {
  chain: string;
  address: string;
  walletId: string;
  /** 友好名称/标签 */
  name: string;
  /** 地址类型：address/contract/validator/contact/internalWallet */
  type: string;
  /** 验证状态：verified/unverified/suspicious */
  status: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 地址类型枚举 */
export type AddressType = "address" | "contract" | "validator" | "contact" | "internalWallet";

/** 验证状态枚举 */
export type VerificationStatus = "verified" | "unverified" | "suspicious";

export interface NotificationMetadata {
  transactionId?: string;
  tokenSymbol?: string;
  chain?: string;
  amount?: string;
}

export interface Notification {
  id: string;
  walletId: string;   // 关联钱包 ID
  title: string;
  content: string;
  type: string;
  metadata?: NotificationMetadata;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  code?: string;
}

/** 服务端钱包地址（wallets_addresses 表） */
export interface ServerWalletAddress {
  id: string;
  chain: string;
  address: string;
  createdAt: string;
}