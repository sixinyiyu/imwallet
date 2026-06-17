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

/**
 * Generate a wallet identifier: aqud + 32 random Base62 characters
 */
function generateIdentifier(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let identifier = "aqud";
  for (let i = 0; i < 32; i++) {
    identifier += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return identifier;
}

export interface AccountSummary {
  id: string;
  walletId: string;
  tokenId: string;
  name: string;
  address: string;
  symbol: string;
  network: string;
  iconUrl?: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
}

export interface AccountDetail extends AccountSummary {
  updatedAt: Date;
}

/**
 * Compute USD and CNY values for an account balance
 */
async function computeAccountValues(
  balance: string,
  symbol: string
): Promise<{ usdValue: string; cnyValue: string }> {
  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  const usdValue = (parseFloat(balance) * usdRate).toFixed(2);
  const cnyValue = (parseFloat(balance) * cnyRate).toFixed(2);

  return { usdValue, cnyValue };
}

/**
 * Create an account under a wallet for a specific token type.
 * For IMPORT wallets with mnemonic, uses BIP44 deterministic derivation.
 * For CREATE wallets (no mnemonic), uses random address generation.
 *
 * @param walletId - Wallet ID
 * @param tokenId - Token ID
 * @param name - Optional account name
 * @param mnemonic - Optional mnemonic phrase for deterministic derivation
 */
export async function createAccount(
  walletId: string,
  tokenId: string,
  name?: string,
  mnemonic?: string
): Promise<AccountDetail> {
  logger.info("ACCOUNT", `创建账户: walletId=${walletId}, tokenId=${tokenId}`);

  // Check if account already exists for this wallet+token combination
  const existing = await prisma.account.findUnique({
    where: { walletId_tokenId: { walletId, tokenId } },
  });

  if (existing) {
    throw createError(409, "Account already exists for this token type in this wallet", "ACCOUNT_EXISTS");
  }

  // Get token info
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) {
    throw createError(404, "Token not found", "TOKEN_NOT_FOUND");
  }

  // Get wallet info to determine source
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "Wallet not found", "WALLET_NOT_FOUND");
  }

  // Generate address based on mnemonic availability and token network
  let address: string;
  if (mnemonic) {
    // If mnemonic is provided (both CREATE and IMPORT wallets),
    // use BIP44 deterministic derivation for cross-wallet compatibility
    address = await deriveAddressFromMnemonic(mnemonic, token.network, 0);
  } else if (token.network === "Tron" || token.symbol === "TRX" || token.symbol === "USDT") {
    // No mnemonic available — use random Tron-style address
    // Both TRX and USDT (on Tron network) use Tron addresses (T...)
    address = generateTronAddress();
  } else {
    // No mnemonic available — use random address
    address = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
  }

  const accountName = name || `${token.symbol} Account`;

  const account = await prisma.account.create({
    data: {
      walletId,
      tokenId,
      name: accountName,
      address,
      balance: 0,
    },
  });

  logger.info("ACCOUNT", `创建账户成功: accountId=${account.id}, address=${address}`);

  const { usdValue, cnyValue } = await computeAccountValues("0", token.symbol);

  return {
    id: account.id,
    walletId: account.walletId,
    tokenId: account.tokenId,
    name: account.name,
    address: account.address,
    symbol: token.symbol,
    network: token.network,
    iconUrl: token.iconUrl || undefined,
    balance: account.balance.toString(),
    usdValue,
    cnyValue,
    decimals: token.decimals,
    updatedAt: account.updatedAt,
  };
}

/**
 * Get all accounts for a wallet
 */
export async function getWalletAccounts(walletId: string): Promise<AccountSummary[]> {
  const accounts = await prisma.account.findMany({
    where: { walletId },
    include: { token: true },
  });

  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  return accounts.map((account: any) => {
    const balance = account.balance.toString();
    const usdValue = (parseFloat(balance) * usdRate).toFixed(2);
    const cnyValue = (parseFloat(balance) * cnyRate).toFixed(2);

    return {
      id: account.id,
      walletId: account.walletId,
      tokenId: account.tokenId,
      name: account.name,
      address: account.address,
      symbol: account.token.symbol,
      network: account.token.network,
      iconUrl: account.token.iconUrl || undefined,
      balance,
      usdValue,
      cnyValue,
      decimals: account.token.decimals,
    };
  });
}

/**
 * Get account detail
 */
export async function getAccountDetail(accountId: string): Promise<AccountDetail> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { token: true },
  });

  if (!account) {
    throw createError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  const { usdValue, cnyValue } = await computeAccountValues(
    account.balance.toString(),
    account.token.symbol
  );

  return {
    id: account.id,
    walletId: account.walletId,
    tokenId: account.tokenId,
    name: account.name,
    address: account.address,
    symbol: account.token.symbol,
    network: account.token.network,
    iconUrl: account.token.iconUrl || undefined,
    balance: account.balance.toString(),
    usdValue,
    cnyValue,
    decimals: account.token.decimals,
    updatedAt: account.updatedAt,
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
 * Get available token types for creating accounts
 */
export async function getAvailableTokens(): Promise<{
  tokens: Array<{
    id: string;
    symbol: string;
    name: string;
    network: string;
    iconUrl?: string;
    decimals: number;
  }>;
}> {
  const tokens = await prisma.token.findMany({
    where: { isActive: true },
    select: {
      id: true,
      symbol: true,
      name: true,
      network: true,
      iconUrl: true,
      decimals: true,
    },
  });

  return { tokens: tokens.map((t: any) => ({ ...t, iconUrl: t.iconUrl || undefined })) };
}