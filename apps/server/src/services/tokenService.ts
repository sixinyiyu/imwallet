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
  { id: string; symbol: string; name: string; decimals: number; network: string; contractAddress?: string; iconUrl?: string; isActive: boolean; isTradable: boolean }[]
> {
  const tokens = await prisma.token.findMany({
    where: { isActive: true },
    orderBy: { symbol: "asc" },
  });

  return tokens.map((t: any) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    network: t.network,
    contractAddress: t.contractAddress || undefined,
    iconUrl: t.iconUrl || undefined,
    isActive: t.isActive,
    isTradable: t.isTradable,
    tokenType: t.tokenType || "NATIVE",
  }));
}

/** 更新代币的交易开关状态 */
export async function updateTokenTradable(
  tokenId: string,
  isTradable: boolean
): Promise<{ id: string; symbol: string; isTradable: boolean }> {
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
  });
  if (!token) {
    throw createError(404, "代币不存在", "TOKEN_NOT_FOUND");
  }

  const updated = await prisma.token.update({
    where: { id: tokenId },
    data: { isTradable },
  });

  return {
    id: updated.id,
    symbol: updated.symbol,
    isTradable: updated.isTradable,
  };
}

export async function getTokenBalances(
  walletId: string
): Promise<TokenBalance[]> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "钱包不存在");
  }

  // Fetch WalletTokens and Tokens separately (no relation include)
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
  });

  const tokenIds = walletTokens.map((wt: any) => wt.tokenId);
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
  });
  const tokenMap = new Map<string, any>(tokens.map((t: any) => [t.id, t]));

  // Get fiat rates for USD and CNY
  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  return walletTokens.map((wt: any) => {
    const tk = tokenMap.get(wt.tokenId);
    const tokenBalance = wt.balance.toString();
    const usdValue = (parseFloat(tokenBalance) * usdRate).toFixed(2);
    const cnyValue = (parseFloat(tokenBalance) * cnyRate).toFixed(2);

    return {
      id: wt.id,
      tokenId: wt.tokenId,
      symbol: tk?.symbol || "",
      name: tk?.name || "",
      balance: tokenBalance,
      usdValue,
      cnyValue,
      decimals: tk?.decimals || 6,
      contractAddress: tk?.contractAddress || undefined,
      network: tk?.network || "",
      iconUrl: tk?.iconUrl || undefined,
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
): Promise<{ totalBalanceCny: string; totalBalanceUsd: string; address: string }> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  // Compute total balance in CNY from WalletToken entries (no relation include)
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
  });

  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);
  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  let totalCny = 0;
  let totalUsd = 0;
  for (const wt of walletTokens) {
    totalCny += parseFloat(wt.balance.toString()) * cnyRate;
    totalUsd += parseFloat(wt.balance.toString()) * usdRate;
  }

  return {
    totalBalanceCny: totalCny.toFixed(2),
    totalBalanceUsd: totalUsd.toFixed(2),
    address: wallet.address,
  };
}