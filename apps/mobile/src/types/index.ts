export interface Device {
  id: number;
  device_id: string;
  platform: string;
  platform_store: string | null;
  os: string | null;
  model: string | null;
  locale: string | null;
  version: string | null;
  currency: string | null;
  token: string | null;
  is_push_enabled: boolean;
  is_price_alerts_enabled: boolean;
  subscriptions_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface Wallet extends SimpleWallet {
  updatedAt?: string;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
  memo?: string;
  passwordHint?: string;
}

/** 简单钱包信息（不含代币余额，供钱包首页下拉列表使用） */
export interface SimpleWallet {
  id: string;
  identifier: string;
  alias: string;
  address: string;
  source: string;
  accountCount: number;
  createdAt: string;
}

/** 聚合钱包信息（含网络列表，供钱包列表页使用） */
export interface AggregateWallet extends SimpleWallet {
  networks: string[];
}

/** 钱包余额详情（总余额+各代币余额，切换钱包时使用） */
export interface WalletBalanceDetail {
  totalBalanceUsd: string;
  totalBalanceCny: string;
  tokens: TokenBalance[];
}

export interface Account {
  id: string;
  walletId: string;
  network: string;
  /** 代币符号（如 TRX、USDT），标识该账户对应的代币 */
  tokenSymbol: string;
  name: string;
  address: string;
  createdAt: string;
  updatedAt?: string;
  /** 该账户对应代币的余额信息 */
  tokenBalances: Array<{
    tokenId: string;
    symbol: string;
    name: string;
    network: string;
    balance: string;
    decimals: number;
    iconUrl?: string;
  }>;
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

export interface TokenBalance {
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

export interface TokenInfo {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  network: string;
  contractAddress?: string;
  iconUrl?: string;
  isActive: boolean;
  isTradable?: boolean;
  tokenType?: string;
}

export interface ChainInfo {
  id: number;
  name: string;
  displayName: string;
  isAccountSupported: boolean;
  derivationPath: string | null;
  /** 该链下可创建账户的代币列表 */
  tokens: Array<{
    symbol: string;
    name: string;
    tokenType: string;
    decimals: number;
  }>;
}

export interface Transaction {
  id: string;
  txHash: string;
  fromWalletId: string;
  fromAddress: string;  // 付款链地址（如 T.../0x...）
  toWalletId: string;  // 默认空字符串，系统内用户时关联钱包ID
  toAddress: string;   // 收款链地址（始终记录）
  tokenSymbol: string; // 代币符号（如 USDT、TRX）
  tokenName: string;   // 代币名称
  amount: string;
  fee: string;
  receivedAmount: string;
  feeMode: string;
  status: string;
  memo: string | null;
  createdAt: string;
  fromWallet: { alias: string; address: string };
  toWallet: { alias: string; address: string };
  fromContactName: string;
  toContactName: string;
}

export interface Contact {
  id: string;
  name: string;
  address: string;
  network: string;
  memo: string | null;
}

export interface Notification {
  id: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  code?: string;
}