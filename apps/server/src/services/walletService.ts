import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

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

export interface WalletSummary {
  id: string;
  alias: string;
  address: string;
  source: string;
  isActive: boolean;
  createdAt: Date;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}

export interface WalletDetail extends WalletSummary {
  updatedAt: Date;
}

/**
 * Generate a deterministic wallet address from a seed.
 * In production, this would use proper HD wallet derivation (BIP32/BIP44).
 * For the private chain, we use a hash-based derivation.
 */
function deriveAddress(seed: string, index: number): string {
  const hash = createHash("sha256")
    .update(`${seed}-${index}-${uuid()}`)
    .digest("hex");

  return "0x" + hash.slice(0, 40).toUpperCase();
}

async function computeTokenBalances(walletId: string): Promise<{
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}> {
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
    include: { token: true },
  });

  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  let totalCny = 0;

  const tokenBalances: WalletTokenBalance[] = walletTokens.map((wt: any) => {
    const balance = wt.balance.toString();
    const usdValue = (parseFloat(balance) * usdRate).toFixed(2);
    const cnyValue = (parseFloat(balance) * cnyRate).toFixed(2);
    totalCny += parseFloat(balance) * cnyRate;

    return {
      id: wt.id,
      tokenId: wt.tokenId,
      symbol: wt.token.symbol,
      name: wt.token.name,
      balance,
      usdValue,
      cnyValue,
      decimals: wt.token.decimals,
      network: wt.token.network,
      iconUrl: wt.token.iconUrl || undefined,
    };
  });

  return {
    tokenBalances,
    totalBalanceCny: totalCny.toFixed(2),
  };
}

export async function createWallet(
  userId: string,
  alias: string
): Promise<WalletDetail> {
  const seed = `user-${userId}-${Date.now()}`;
  const address = deriveAddress(seed, 0);

  const wallet = await prisma.wallet.create({
    data: {
      alias,
      address,
      source: "CREATE",
      users: {
        create: {
          userId,
          isActive: false,
        },
      },
    },
    include: {
      users: {
        where: { userId },
        select: { isActive: true },
      },
    },
  });

  // Create WalletToken entries for all active tokens (balance=0)
  const activeTokens = await prisma.token.findMany({
    where: { isActive: true },
  });

  if (activeTokens.length > 0) {
    await prisma.walletToken.createMany({
      data: activeTokens.map((token: any) => ({
        walletId: wallet.id,
        tokenId: token.id,
        balance: 0,
      })),
    });
  }

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);

  return {
    id: wallet.id,
    alias: wallet.alias,
    address: wallet.address,
    source: wallet.source as string,
    isActive: wallet.users[0]?.isActive ?? false,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

export async function importWallet(
  userId: string,
  mnemonic: string,
  alias: string,
  privateKey?: string
): Promise<WalletDetail> {
  const seed = mnemonic || privateKey || `import-${Date.now()}`;
  const address = deriveAddress(seed, 0);

  const wallet = await prisma.wallet.create({
    data: {
      alias,
      address,
      source: "IMPORT",
      users: {
        create: {
          userId,
          isActive: false,
        },
      },
    },
    include: {
      users: {
        where: { userId },
        select: { isActive: true },
      },
    },
  });

  // Create WalletToken entries for all active tokens (balance=0)
  const activeTokens = await prisma.token.findMany({
    where: { isActive: true },
  });

  if (activeTokens.length > 0) {
    await prisma.walletToken.createMany({
      data: activeTokens.map((token: any) => ({
        walletId: wallet.id,
        tokenId: token.id,
        balance: 0,
      })),
    });
  }

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);

  return {
    id: wallet.id,
    alias: wallet.alias,
    address: wallet.address,
    source: wallet.source as string,
    isActive: wallet.users[0]?.isActive ?? false,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

export async function getUserWallets(
  userId: string
): Promise<WalletSummary[]> {
  const userWallets = await prisma.userWallet.findMany({
    where: { userId },
    include: {
      wallet: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute token balances for each wallet
  const walletSummaries: WalletSummary[] = [];
  for (const uw of userWallets) {
    const { tokenBalances, totalBalanceCny } = await computeTokenBalances(uw.wallet.id);
    walletSummaries.push({
      id: uw.wallet.id,
      alias: uw.wallet.alias,
      address: uw.wallet.address,
      source: uw.wallet.source as string,
      isActive: uw.isActive,
      createdAt: uw.wallet.createdAt,
      tokenBalances,
      totalBalanceCny,
    });
  }

  return walletSummaries;
}

export async function getWalletDetail(
  walletId: string,
  userId: string
): Promise<WalletDetail> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: {
      users: {
        where: { userId },
        select: { isActive: true },
      },
    },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);

  return {
    id: wallet.id,
    alias: wallet.alias,
    address: wallet.address,
    source: wallet.source as string,
    isActive: wallet.users[0]?.isActive ?? false,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

export async function deleteWallet(
  walletId: string,
  userId: string
): Promise<void> {
  const userWallet = await prisma.userWallet.findUnique({
    where: {
      userId_walletId: { userId, walletId },
    },
  });

  if (!userWallet) {
    throw createError(404, "Wallet not found");
  }

  await prisma.wallet.delete({
    where: { id: walletId },
  });
}

export async function activateWallet(
  userId: string,
  walletId: string
): Promise<void> {
  const userWallet = await prisma.userWallet.findUnique({
    where: {
      userId_walletId: { userId, walletId },
    },
  });

  if (!userWallet) {
    throw createError(404, "Wallet not found");
  }

  await prisma.$transaction([
    prisma.userWallet.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
    prisma.userWallet.update({
      where: { id: userWallet.id },
      data: { isActive: true },
    }),
  ]);
}