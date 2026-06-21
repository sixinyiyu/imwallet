import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

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
 * Uses wallet_subscriptions → wallets_addresses table.
 */
export async function getWalletsNetworksBatch(walletIds: string[]): Promise<Array<{ walletId: string; networks: string[] }>> {
  // 通过 subscriptions 获取 address_id
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: { in: walletIds }, address_id: { not: "" } },
    select: { wallet_id: true, address_id: true },
  });

  const addressIds = subs.map((s: any) => s.address_id);
  if (addressIds.length === 0) {
    return walletIds.map((wid) => ({ walletId: wid, networks: [] }));
  }

  // 查 wallets_addresses 获取 chain
  const walletAddresses = await prisma.walletAddress.findMany({
    where: { id: { in: addressIds } },
    select: { id: true, chain: true },
  });

  // Build address_id → chain map
  const addressChainMap = new Map<string, string>();
  for (const wa of walletAddresses) {
    addressChainMap.set(wa.id, wa.chain);
  }

  // Group by wallet_id, deduplicate chains
  const map = new Map<string, Set<string>>();
  for (const sub of subs) {
    const chain = addressChainMap.get(sub.address_id);
    if (!chain) continue;
    const set = map.get(sub.wallet_id) || new Set<string>();
    set.add(chain);
    map.set(sub.wallet_id, set);
  }

  return walletIds.map((wid) => ({
    walletId: wid,
    networks: Array.from(map.get(wid) || new Set<string>()),
  }));
}