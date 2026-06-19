import { v4 as uuid } from "uuid";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { deriveAddressFromMnemonic } from "../services/derivationService";

/**
 * Generate a Tron-style address: T + 33 random characters (0-9, a-z, A-Z)
 */
function generateTronAddress(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let address = "T";
  for (let i = 0; i < 33; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return address;
}

export interface AccountSummary {
  id: string;
  walletId: string;
  network: string;
  name: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDetail extends AccountSummary {
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

/**
 * Create an account under a wallet for a specific network.
 * Each wallet can have one account per network (e.g., one Tron account).
 *
 * @param walletId - Wallet ID
 * @param network - Blockchain network (e.g., "Tron", "Ethereum")
 * @param name - Optional account name
 * @param mnemonic - Optional mnemonic phrase for deterministic derivation
 */
export async function createAccount(
  walletId: string,
  network: string,
  name?: string,
  mnemonic?: string
): Promise<AccountDetail> {
  logger.info("ACCOUNT", `创建账户: walletId=${walletId}, network=${network}`);

  // Check if account already exists for this wallet+network combination
  const existing = await prisma.account.findUnique({
    where: { walletId_network: { walletId, network } },
  });

  if (existing) {
    throw createError(409, "该钱包下此网络已有账户", "ACCOUNT_EXISTS");
  }

  // Get wallet info to determine source
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // Generate address based on mnemonic availability and network
  let address: string;
  if (mnemonic) {
    // Use BIP44 deterministic derivation
    address = await deriveAddressFromMnemonic(mnemonic, network, 0);
  } else if (network === "Tron") {
    // No mnemonic — use random Tron-style address
    address = generateTronAddress();
  } else {
    // No mnemonic — use random Ethereum-style address
    address = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
  }

  const accountName = name || `${network} Account`;

  const account = await prisma.account.create({
    data: {
      walletId,
      network,
      name: accountName,
      address,
    },
  });

  logger.info("ACCOUNT", `创建账户成功: accountId=${account.id}, address=${address}`);

  // Fetch token balances for this wallet on this network
  const tokenBalances = await getAccountTokenBalances(walletId, network);

  return {
    id: account.id,
    walletId: account.walletId,
    network: account.network,
    name: account.name,
    address: account.address,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    tokenBalances,
  };
}

/**
 * Get token balances for a wallet on a specific network
 * (No relation include - fetch tokens separately)
 */
async function getAccountTokenBalances(
  walletId: string,
  network: string
): Promise<Array<{
  tokenId: string;
  symbol: string;
  name: string;
  network: string;
  balance: string;
  decimals: number;
  iconUrl?: string;
}>> {
  // First find tokens for this network, then filter WalletTokens by those token IDs
  const networkTokens = await prisma.token.findMany({
    where: { network },
  });
  const networkTokenIds = networkTokens.map((t: any) => t.id);
  const tokenMap = new Map<string, any>(networkTokens.map((t: any) => [t.id, t]));

  const walletTokens = await prisma.walletToken.findMany({
    where: {
      walletId,
      tokenId: { in: networkTokenIds },
    },
  });

  return walletTokens.map((wt: any) => {
    const tk = tokenMap.get(wt.tokenId);
    return {
      tokenId: wt.tokenId,
      symbol: tk?.symbol || "",
      name: tk?.name || "",
      network: tk?.network || network,
      balance: wt.balance.toString(),
      decimals: tk?.decimals || 6,
      iconUrl: tk?.iconUrl || undefined,
    };
  });
}

/**
 * Get all accounts for a wallet
 */
export async function getWalletAccounts(walletId: string): Promise<AccountDetail[]> {
  const accounts = await prisma.account.findMany({
    where: { walletId },
  });

  const result: AccountDetail[] = [];
  for (const account of accounts) {
    const tokenBalances = await getAccountTokenBalances(walletId, account.network);
    result.push({
      id: account.id,
      walletId: account.walletId,
      network: account.network,
      name: account.name,
      address: account.address,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      tokenBalances,
    });
  }

  return result;
}

/**
 * Get account detail
 */
export async function getAccountDetail(accountId: string): Promise<AccountDetail> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw createError(404, "账户不存在", "ACCOUNT_NOT_FOUND");
  }

  const tokenBalances = await getAccountTokenBalances(account.walletId, account.network);

  return {
    id: account.id,
    walletId: account.walletId,
    network: account.network,
    name: account.name,
    address: account.address,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    tokenBalances,
  };
}

/**
 * Delete an account
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw createError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  logger.info("ACCOUNT", `删除账户: accountId=${accountId}`);
  await prisma.account.delete({ where: { id: accountId } });
}

/**
 * Get available networks for creating accounts.
 * Only returns tokens where isAccountToken=true, grouped by network.
 */
export async function getAvailableNetworks(): Promise<{
  networks: Array<{
    network: string;
    tokens: Array<{
      id: string;
      symbol: string;
      name: string;
      decimals: number;
      iconUrl?: string;
      isAccountToken: boolean;
    }>;
  }>;
}> {
  const tokens = await prisma.token.findMany({
    where: { isActive: true, isAccountToken: true },
    select: {
      id: true,
      symbol: true,
      name: true,
      network: true,
      decimals: true,
      iconUrl: true,
      isAccountToken: true,
    },
  });

  // Group by network
  const networkMap = new Map<string, Array<typeof tokens[0]>>();
  for (const t of tokens) {
    const list = networkMap.get(t.network) || [];
    list.push(t);
    networkMap.set(t.network, list);
  }

  const networks = Array.from(networkMap.entries()).map(([network, tokens]) => ({
    network,
    tokens: tokens.map((t: any) => ({ ...t, iconUrl: t.iconUrl || undefined })),
  }));

  return { networks };
}

/**
 * Batch get deduplicated networks for multiple wallets.
 * Lightweight — only returns walletId + unique network names.
 */
export async function getWalletsNetworksBatch(walletIds: string[]): Promise<Array<{ walletId: string; networks: string[] }>> {
  const accounts = await prisma.account.findMany({
    where: { walletId: { in: walletIds } },
    select: { walletId: true, network: true },
  });

  // Group by walletId, deduplicate networks
  const map = new Map<string, Set<string>>();
  for (const a of accounts) {
    const set = map.get(a.walletId) || new Set<string>();
    set.add(a.network);
    map.set(a.walletId, set);
  }

  return walletIds.map((wid) => ({
    walletId: wid,
    networks: Array.from(map.get(wid) || new Set<string>()),
  }));
}
