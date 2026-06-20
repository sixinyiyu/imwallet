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
  tokenSymbol: string;
  name: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDetail extends AccountSummary {
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

/**
 * Create accounts under a wallet for a specific network.
 * Creates one Account per token on the specified network (e.g., Tron TRX + Tron USDT).
 * Each account is a separate entity for independent accounting.
 *
 * @param walletId - Wallet ID
 * @param network - Blockchain network (e.g., "Tron", "Ethereum")
 * @param name - Optional account name prefix
 * @param mnemonic - Optional mnemonic phrase for deterministic derivation
 * @param allowMultiAccount - If true, allows creating additional accounts even if accounts already exist on this chain
 * @returns Array of created account details
 */
export async function createAccount(
  walletId: string,
  network: string,
  name?: string,
  mnemonic?: string,
  allowMultiAccount?: boolean
): Promise<AccountDetail[]> {
  logger.info("ACCOUNT", `创建账户: walletId=${walletId}, network=${network}, allowMultiAccount=${!!allowMultiAccount}`);

  // Get wallet info
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // Find all active tokens on this network
  const chainTokens = await prisma.token.findMany({
    where: { isActive: true, network },
  });

  if (chainTokens.length === 0) {
    throw createError(400, `网络 ${network} 无可用代币`, "NO_TOKENS_ON_NETWORK");
  }

  // Check which (network, tokenSymbol) accounts already exist
  const existingAccounts = await prisma.account.findMany({
    where: { walletId, network },
    select: { tokenSymbol: true, address: true, index: true },
    orderBy: { index: "desc" },
  });
  const existingTokenSymbols = new Set(existingAccounts.map((a: any) => a.tokenSymbol));
  const maxIndex = existingAccounts.length > 0 ? (existingAccounts[0] as any).index : -1;

  // Determine which tokens to create and at which index
  let tokensToCreate: typeof chainTokens;
  let accountIndex: number;
  let address: string;

  if (allowMultiAccount && existingAccounts.length > 0) {
    // Multi-account mode: create ALL tokens at the next index
    accountIndex = maxIndex + 1;
    tokensToCreate = chainTokens;

    // Derive new address at the new index
    if (mnemonic) {
      address = await deriveAddressFromMnemonic(mnemonic, network, accountIndex);
    } else if (network === "Tron") {
      address = generateTronAddress();
    } else {
      address = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
    }
  } else {
    // Default mode: only create missing token accounts at index 0
    accountIndex = 0;
    tokensToCreate = chainTokens.filter((t: any) => !existingTokenSymbols.has(t.symbol));

    if (tokensToCreate.length === 0) {
      throw createError(409, "该钱包下此网络的所有代币账户已存在", "ACCOUNT_EXISTS");
    }

    // Reuse existing address if any account exists on this network
    if (existingAccounts.length > 0 && existingAccounts[existingAccounts.length - 1].address) {
      address = existingAccounts[existingAccounts.length - 1].address;
    } else if (mnemonic) {
      address = await deriveAddressFromMnemonic(mnemonic, network, 0);
    } else if (network === "Tron") {
      address = generateTronAddress();
    } else {
      address = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
    }
  }

  const createdAccounts: AccountDetail[] = [];

  for (const token of tokensToCreate) {
    const accountName = name
      ? `${name} ${token.symbol}`
      : `${network} ${token.symbol}`;

    const account = await prisma.account.create({
      data: {
        walletId,
        network,
        tokenSymbol: token.symbol,
        index: accountIndex,
        name: accountName,
        address,
      },
    });

    logger.info("ACCOUNT", `创建账户成功: accountId=${account.id}, network=${network}, token=${token.symbol}, index=${accountIndex}, address=${address}`);

    // Ensure WalletToken exists for this token
    await prisma.walletToken.upsert({
      where: {
        walletId_tokenId: { walletId, tokenId: token.id },
      },
      update: {},
      create: {
        walletId,
        tokenId: token.id,
        balance: 0,
      },
    });

    // Fetch token balance for this account
    const tokenBalances = await getAccountTokenBalances(walletId, network, token.symbol);

    createdAccounts.push({
      id: account.id,
      walletId: account.walletId,
      network: account.network,
      tokenSymbol: account.tokenSymbol,
      name: account.name,
      address: account.address,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      tokenBalances,
    });
  }

  return createdAccounts;
}

/**
 * Get token balance for a specific account (filtered by tokenSymbol).
 * If tokenSymbol is provided, returns only that token's balance.
 * If not, returns all token balances for the network (backward compatibility).
 */
async function getAccountTokenBalances(
  walletId: string,
  network: string,
  tokenSymbol?: string
): Promise<Array<{
  tokenId: string;
  symbol: string;
  name: string;
  network: string;
  balance: string;
  decimals: number;
  iconUrl?: string;
}>> {
  // Find tokens for this network, optionally filtered by symbol
  const networkTokens = await prisma.token.findMany({
    where: tokenSymbol ? { network, symbol: tokenSymbol } : { network },
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
    orderBy: [{ network: "asc" }, { tokenSymbol: "asc" }],
  });

  const result: AccountDetail[] = [];
  for (const account of accounts) {
    const tokenBalances = await getAccountTokenBalances(
      walletId,
      account.network,
      account.tokenSymbol
    );
    result.push({
      id: account.id,
      walletId: account.walletId,
      network: account.network,
      tokenSymbol: account.tokenSymbol,
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

  const tokenBalances = await getAccountTokenBalances(
    account.walletId,
    account.network,
    account.tokenSymbol
  );

  return {
    id: account.id,
    walletId: account.walletId,
    network: account.network,
    tokenSymbol: account.tokenSymbol,
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

  logger.info("ACCOUNT", `删除账户: accountId=${accountId}, network=${account.network}, token=${account.tokenSymbol}`);
  await prisma.account.delete({ where: { id: accountId } });
}

/** Chain with its tokens, for the available chains API */
export interface ChainWithTokens {
  id: number;
  name: string;
  displayName: string;
  isAccountSupported: boolean;
  derivationPath: string | null;
  tokens: Array<{
    symbol: string;
    name: string;
    tokenType: string;
    decimals: number;
  }>;
}

/**
 * Get available chains for creating accounts.
 * Returns chains where isAccountSupported=true, along with their tokens.
 */
export async function getAvailableChains(): Promise<ChainWithTokens[]> {
  const chains = await prisma.chain.findMany({
    where: { isAccountSupported: true },
    orderBy: { name: "asc" },
  });

  const result: ChainWithTokens[] = [];
  for (const chain of chains) {
    const tokens = await prisma.token.findMany({
      where: { isActive: true, network: chain.name },
      select: { symbol: true, name: true, tokenType: true, decimals: true },
      orderBy: { tokenType: "asc" },
    });

    result.push({
      id: chain.id,
      name: chain.name,
      displayName: chain.displayName,
      isAccountSupported: chain.isAccountSupported,
      derivationPath: chain.derivationPath,
      tokens: tokens.map((t: any) => ({
        symbol: t.symbol,
        name: t.name,
        tokenType: t.tokenType,
        decimals: t.decimals,
      })),
    });
  }

  return result;
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