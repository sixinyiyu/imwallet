import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

export interface AssetBalance {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
  type: string;
  chain: string;
  tokenId?: string | null;
  iconUrl?: string;
}

export interface AssetInfo {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  chain: string;
  type: string;
  tokenId?: string | null;
  iconUrl?: string;
  isActive: boolean;
  isDefault: boolean;
  isTradable: boolean;
}

/** Get all active assets */
export async function getAllAssets(): Promise<AssetInfo[]> {
  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    orderBy: [{ chain: "asc" }, { type: "asc" }, { symbol: "asc" }],
  });

  return assets.map((a: any) => ({
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    decimals: a.decimals,
    chain: a.chain,
    type: a.type,
    tokenId: a.tokenId || null,
    iconUrl: a.iconUrl || undefined,
    isActive: a.isActive,
    isDefault: a.isDefault,
    isTradable: a.isTradable,
  }));
}

/** Update asset tradable status */
export async function updateAssetTradable(
  assetId: string,
  isTradable: boolean
): Promise<{ id: string; symbol: string; isTradable: boolean }> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });
  if (!asset) {
    throw createError(404, "资产不存在", "ASSET_NOT_FOUND");
  }

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: { isTradable },
  });

  return {
    id: updated.id,
    symbol: updated.symbol,
    isTradable: updated.isTradable,
  };
}

/**
 * Get wallet's aggregated asset balances (sum across all accounts).
 */
export async function getWalletAssetBalances(walletId: string): Promise<AssetBalance[]> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "钱包不存在");
  }

  // 1. Find all accounts under this wallet
  const accounts = await prisma.account.findMany({
    where: { walletId },
    select: { id: true },
  });
  const accountIds = accounts.map((a: any) => a.id);

  if (accountIds.length === 0) {
    return [];
  }

  // 2. Fetch all account_assets
  const accountAssets = await prisma.accountAsset.findMany({
    where: { accountId: { in: accountIds } },
  });

  // 3. Fetch asset definitions
  const assetIds = [...new Set(accountAssets.map((aa: any) => aa.assetId))];
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
  });
  const assetMap = new Map<string, any>(assets.map((a: any) => [a.id, a]));

  // 4. Get fiat rates
  const [usdFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);
  const usdRate = usdFiat ? parseFloat(usdFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  // 5. Aggregate balances by asset
  const balanceMap = new Map<string, number>();
  for (const aa of accountAssets) {
    const current = balanceMap.get(aa.assetId) || 0;
    balanceMap.set(aa.assetId, current + parseFloat(aa.balance.toString()));
  }

  const result: AssetBalance[] = [];
  for (const [assetId, totalBalance] of balanceMap) {
    const ast = assetMap.get(assetId);
    if (!ast) continue;
    const usdValue = (totalBalance * usdRate).toFixed(2);
    const cnyValue = (totalBalance * cnyRate).toFixed(2);

    result.push({
      id: assetId,
      assetId: assetId,
      symbol: ast.symbol,
      name: ast.name,
      balance: totalBalance.toString(),
      usdValue,
      cnyValue,
      decimals: ast.decimals || 6,
      type: ast.type || "NATIVE",
      chain: ast.chain || "",
      tokenId: ast.tokenId || null,
      iconUrl: ast.iconUrl || undefined,
    });
  }

  return result;
}

/**
 * Get wallet total balance (CNY + USD).
 */
export async function getWalletBalance(
  walletId: string
): Promise<{ totalBalanceCny: string; totalBalanceUsd: string; address: string }> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  // Aggregate from account_assets
  const accounts = await prisma.account.findMany({
    where: { walletId },
    select: { id: true },
  });
  const accountIds = accounts.map((a: any) => a.id);

  if (accountIds.length === 0) {
    return { totalBalanceCny: "0.00", totalBalanceUsd: "0.00", address: wallet.address };
  }

  const accountAssets = await prisma.accountAsset.findMany({
    where: { accountId: { in: accountIds } },
  });

  const [usdFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);
  const usdRate = usdFiat ? parseFloat(usdFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  let totalCny = 0;
  let totalUsd = 0;
  for (const aa of accountAssets) {
    const balance = parseFloat(aa.balance.toString());
    totalCny += balance * cnyRate;
    totalUsd += balance * usdRate;
  }

  return {
    totalBalanceCny: totalCny.toFixed(2),
    totalBalanceUsd: totalUsd.toFixed(2),
    address: wallet.address,
  };
}
