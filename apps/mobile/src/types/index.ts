export interface User {
  id: string;
  username: string;
  role: string;
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

export interface Wallet {
  id: string;
  alias: string;
  address: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
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
  fromUsername: string;
  toUsername: string;
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
