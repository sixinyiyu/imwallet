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
  index: number;
  name: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDetail extends AccountSummary {
  /** 该账户下的资产列表 */
  assets: Array<{
    id: string;
    assetId: string;
    symbol: string;
    name: string;
    type: string;
    chain: string;
    balance: string;
    decimals: number;
    tokenId?: string | null;
    iconUrl?: string;
  }>;
}

/**
 * Create an account under a wallet for a specific network.
 * Creates ONE account (one chain address) and auto-adds default assets (NATIVE + default TOKENs).
 *
 * @param walletId - Wallet ID
 * @param network - Blockchain network (e.g., "Tron", "Ethereum")
 * @param name - Optional account name
 * @param mnemonic - Optional mnemonic phrase for deterministic derivation
 * @param allowMultiAccount - If true, allows creating additional accounts even if accounts already exist on this chain
 * @returns Created account detail
 */
export async function createAccount(
  walletId: string,
  network: string,
  name?: string,
  mnemonic?: string,
  allowMultiAccount?: boolean
): Promise<AccountDetail> {
  logger.info("ACCOUNT", `创建账户: walletId=${walletId}, network=${network}, allowMultiAccount=${!!allowMultiAccount}`);

  // Get wallet info
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // Find all active assets on this network
  const chainAssets = await prisma.asset.findMany({
    where: { isActive: true, chain: network },
  });

  if (chainAssets.length === 0) {
    throw createError(400, `网络 ${network} 无可用资产`, "NO_ASSETS_ON_NETWORK");
  }

  // Check existing accounts on this network
  const existingAccounts = await prisma.account.findMany({
    where: { walletId, network },
    orderBy: { index: "desc" },
  });
  const maxIndex = existingAccounts.length > 0 ? (existingAccounts[0] as any).index : -1;

  if (!allowMultiAccount && existingAccounts.length > 0) {
    throw createError(409, "该钱包下此网络已有账户", "ACCOUNT_EXISTS");
  }

  // Determine account index
  const accountIndex = maxIndex + 1;

  // Derive address
  let address: string;
  if (mnemonic) {
    address = await deriveAddressFromMnemonic(mnemonic, network, accountIndex);
  } else if (network === "Tron") {
    address = generateTronAddress();
  } else {
    address = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
  }

  const accountName = name || `${network} Account ${accountIndex + 1}`;

  // Create the account
  const account = await prisma.account.create({
    data: {
      walletId,
      network,
      index: accountIndex,
      name: accountName,
      address,
    },
  });

  logger.info("ACCOUNT", `创建账户成功: accountId=${account.id}, network=${network}, index=${accountIndex}, address=${address}`);

  // Auto-add default assets for this account (NATIVE + default TOKENs)
  const defaultAssets = chainAssets.filter((a: any) => a.isDefault);
  for (const asset of defaultAssets) {
    await prisma.accountAsset.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        balance: 0,
      },
    });
    logger.info("ACCOUNT", `自动添加资产: asset=${asset.symbol} (${asset.type}), accountId=${account.id}`);
  }

  // Fetch account with assets
  return getAccountDetail(account.id);
}

/**
 * Get all accounts for a wallet
 */
export async function getWalletAccounts(walletId: string): Promise<AccountDetail[]> {
  const accounts = await prisma.account.findMany({
    where: { walletId },
    orderBy: [{ network: "asc" }, { index: "asc" }],
  });

  const result: AccountDetail[] = [];
  for (const account of accounts) {
    result.push(await getAccountDetail(account.id));
  }

  return result;
}

/**
 * Get account detail with assets
 */
export async function getAccountDetail(accountId: string): Promise<AccountDetail> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw createError(404, "账户不存在", "ACCOUNT_NOT_FOUND");
  }

  // Fetch account assets
  const accountAssets = await prisma.accountAsset.findMany({
    where: { accountId: account.id },
  });

  const assetIds = accountAssets.map((aa: any) => aa.assetId);
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
  });
  const assetMap = new Map<string, any>(assets.map((a: any) => [a.id, a]));

  return {
    id: account.id,
    walletId: account.walletId,
    network: account.network,
    index: account.index,
    name: account.name,
    address: account.address,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    assets: accountAssets.map((aa: any) => {
      const ast = assetMap.get(aa.assetId);
      return {
        id: aa.id,
        assetId: aa.assetId,
        symbol: ast?.symbol || "",
        name: ast?.name || "",
        type: ast?.type || "NATIVE",
        chain: ast?.chain || account.network,
        balance: aa.balance.toString(),
        decimals: ast?.decimals || 6,
        tokenId: ast?.tokenId || null,
        iconUrl: ast?.iconUrl || undefined,
      };
    }),
  };
}

/**
 * Delete an account and its assets
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw createError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  logger.info("ACCOUNT", `删除账户: accountId=${accountId}, network=${account.network}`);

  // Delete account assets first
  await prisma.accountAsset.deleteMany({ where: { accountId } });
  await prisma.account.delete({ where: { id: accountId } });
}

/** Chain with its assets, for the available chains API */
export interface ChainWithAssets {
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

/**
 * Get available chains for creating accounts.
 * Returns chains where accountEnable=true, along with their assets.
 */
export async function getAvailableChains(): Promise<ChainWithAssets[]> {
  const chains = await prisma.chain.findMany({
    where: { accountEnable: true },
    orderBy: { name: "asc" },
  });

  const result: ChainWithAssets[] = [];
  for (const chain of chains) {
    const assets = await prisma.asset.findMany({
      where: { isActive: true, chain: chain.name },
      orderBy: [{ type: "asc" }, { symbol: "asc" }],
    });

    result.push({
      id: chain.id,
      name: chain.name,
      displayName: chain.displayName,
      accountEnable: chain.accountEnable,
      derivationPath: chain.derivationPath,
      assets: assets.map((a: any) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        type: a.type,
        decimals: a.decimals,
        tokenId: a.tokenId || null,
        isDefault: a.isDefault,
      })),
    });
  }

  return result;
}

/**
 * Batch get deduplicated networks for multiple wallets.
 */
export async function getWalletsNetworksBatch(walletIds: string[]): Promise<Array<{ walletId: string; networks: string[] }>> {
  const accounts = await prisma.account.findMany({
    where: { walletId: { in: walletIds } },
    select: { walletId: true, network: true },
  });

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