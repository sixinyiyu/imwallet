import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

export interface TokenBalance {
  id: string;
  tokenId: string;
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
  contractAddress?: string;
  network: string;
  iconUrl?: string;
}

export async function getAllTokens(): Promise<
  { id: string; symbol: string; name: string; decimals: number; network: string; contractAddress?: string; iconUrl?: string; isActive: boolean }[]
> {
  const tokens = await prisma.token.findMany({
    where: { isActive: true },
    orderBy: { symbol: "asc" },
  });

  return tokens.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    network: t.network,
    contractAddress: t.contractAddress || undefined,
    iconUrl: t.iconUrl || undefined,
    isActive: t.isActive,
  }));
}

export async function getTokenBalances(
  walletId: string
): Promise<TokenBalance[]> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  // Get all WalletToken entries for this wallet, including Token info
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
    include: { token: true },
  });

  // Get fiat rates for USD and CNY
  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  return walletTokens.map((wt) => {
    const tokenBalance = wt.balance.toString();
    const usdValue = (parseFloat(tokenBalance) * usdRate).toFixed(2);
    const cnyValue = (parseFloat(tokenBalance) * cnyRate).toFixed(2);

    return {
      id: wt.id,
      tokenId: wt.tokenId,
      symbol: wt.token.symbol,
      name: wt.token.name,
      balance: tokenBalance,
      usdValue,
      cnyValue,
      decimals: wt.token.decimals,
      contractAddress: wt.token.contractAddress || undefined,
      network: wt.token.network,
      iconUrl: wt.token.iconUrl || undefined,
    };
  });
}

export async function getOrCreateWalletToken(
  walletId: string,
  tokenId: string
): Promise<{ id: string; walletId: string; tokenId: string; balance: string }> {
  const walletToken = await prisma.walletToken.upsert({
    where: {
      walletId_tokenId: { walletId, tokenId },
    },
    update: {},
    create: {
      walletId,
      tokenId,
      balance: 0,
    },
  });

  return {
    id: walletToken.id,
    walletId: walletToken.walletId,
    tokenId: walletToken.tokenId,
    balance: walletToken.balance.toString(),
  };
}

export async function getWalletBalance(
  walletId: string
): Promise<{ totalBalanceCny: string; address: string }> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  // Compute total balance in CNY from WalletToken entries
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
    include: { token: true },
  });

  const cnyFiat = await prisma.fiatCurrency.findUnique({ where: { code: "CNY" } });
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  let totalCny = 0;
  for (const wt of walletTokens) {
    totalCny += parseFloat(wt.balance.toString()) * cnyRate;
  }

  return {
    totalBalanceCny: totalCny.toFixed(2),
    address: wallet.address,
  };
}
