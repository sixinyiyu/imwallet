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

export interface Wallet {
  id: string;
  identifier: string;
  alias: string;
  address: string;
  source: string;
  isBackedUp: boolean;
  accountCount: number;
  createdAt: string;
  updatedAt?: string;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
  memo?: string;
  passwordHint?: string;
}

export interface Account {
  id: string;
  walletId: string;
  network: string;
  name: string;
  address: string;
  createdAt: string;
  updatedAt?: string;
  /** 该网络账户下的代币余额列表 */
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
  isAccountToken?: boolean;
}

export interface Transaction {
  id: string;
  txHash: string;
  fromWalletId: string;
  toWalletId: string;
  tokenId: string;
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
  tokenSymbol: string;
  tokenName: string;
}

export interface Contact {
  id: string;
  name: string;
  address: string;
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