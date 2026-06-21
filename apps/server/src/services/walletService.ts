import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface WalletTokenBalance {
  id: string;
  tokenId: string;
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  cnyValue: string;
  decimals: number;
  type: string;
  network: string;
  iconUrl?: string;
}

/** 简单钱包信息（不含代币余额，供钱包首页下拉列表使用） */
export interface SimpleWallet {
  id: string;
  name: string;
  source: string;
  createdAt: Date;
}

/** 聚合钱包信息（含网络列表，供钱包列表页使用） */
export interface AggregateWallet extends SimpleWallet {
  networks: string[];
}

/** 钱包余额详情（总余额+各资产余额，切换钱包时使用） */
export interface WalletBalanceDetail {
  totalBalanceUsd: string;
  totalBalanceCny: string;
  assets: Array<{
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
  }>;
}

export interface WalletSummary {
  id: string;
  name: string;
  source: string;
  createdAt: Date;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}

export interface WalletDetail extends WalletSummary {
  updatedAt: Date;
}

/**
 * Compute wallet's asset balances by aggregating all assets_addresses under this wallet.
 * Uses wallet_subscriptions → wallets_addresses → assets_addresses (via address_id) chain.
 */
async function computeTokenBalances(walletId: string): Promise<{
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}> {
  // 1. 通过 subscriptions 获取 address_id
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: walletId, address_id: { not: "" } },
    select: { address_id: true },
  });
  const addressIds = subs.map((s: any) => s.address_id);

  if (addressIds.length === 0) {
    return { tokenBalances: [], totalBalanceCny: "0.00" };
  }

  // 2. Fetch all assets_addresses for these addresses
  const assetsAddresses = await prisma.assetsAddress.findMany({
    where: { addressId: { in: addressIds } },
  });

  // 3. Fetch asset definitions
  const assetIds = [...new Set(assetsAddresses.map((aa: any) => aa.assetId))];
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

  // 5. Aggregate balances by asset (sum across addresses)
  const balanceMap = new Map<string, number>();
  for (const aa of assetsAddresses) {
    const current = balanceMap.get(aa.assetId) || 0;
    balanceMap.set(aa.assetId, current + parseFloat(aa.balance.toString()));
  }

  let totalCny = 0;
  const tokenBalances: WalletTokenBalance[] = [];

  for (const [assetId, totalBalance] of balanceMap) {
    const ast = assetMap.get(assetId);
    if (!ast) continue;
    const usdValue = (totalBalance * usdRate).toFixed(2);
    const cnyValue = (totalBalance * cnyRate).toFixed(2);
    totalCny += totalBalance * cnyRate;

    tokenBalances.push({
      id: assetId,
      tokenId: assetId,
      symbol: ast.symbol,
      name: ast.name,
      balance: totalBalance.toString(),
      usdValue,
      cnyValue,
      decimals: ast.decimals || 6,
      type: ast.type || "NATIVE",
      network: ast.chain || "",
      iconUrl: ast.iconUrl || undefined,
    });
  }

  return {
    tokenBalances,
    totalBalanceCny: totalCny.toFixed(2),
  };
}

/**
 * 创建/导入钱包（精简版）：服务端只创建 { id, source }，不存密码/助记词哈希。
 * 密码、助记词哈希、别名等存储在客户端 SQLite。
 * walletId 由客户端生成（aqud + SHA256(mnemonic)前32位hex）。
 * 如果 walletId 已存在（相同助记词导入），更新 alias 但不改 source，返回已有 wallet。
 * 不再创建钱包级订阅（空 chain），只创建/更新 wallets 表记录。
 * 地址级订阅在添加网络账户时创建。
 */
export async function createOrImportWallet(
  deviceId: string,
  walletId: string,
  alias: string,
  source: "CREATE" | "IMPORT"
): Promise<{ id: string; name: string; source: string; createdAt: Date; updatedAt: Date }> {
  logger.info("WALLET", `${source === "IMPORT" ? "导入" : "创建"}钱包: deviceId=${deviceId.slice(0, 8)}..., walletId=${walletId}`);

  // 检查钱包是否已存在（相同助记词导入会生成相同的 walletId）
  const existingWallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (existingWallet) {
    // 钱包已存在（相同助记词导入），更新 alias 但不改 source
    logger.info("WALLET", `钱包已存在，更新别名: walletId=${walletId}`);

    // 更新 alias（来源 source 不变）
    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { alias },
    });

    return {
      id: updatedWallet.id,
      name: updatedWallet.alias,
      source: updatedWallet.source as string,
      createdAt: updatedWallet.createdAt,
      updatedAt: updatedWallet.updatedAt,
    };
  }

  // 创建新钱包（id 由客户端生成）
  const wallet = await prisma.wallet.create({
    data: {
      id: walletId,
      alias,
      source,
    },
  });

  logger.info("WALLET", `${source === "IMPORT" ? "导入" : "创建"}钱包成功: walletId=${wallet.id}`);

  return {
    id: wallet.id,
    name: wallet.alias,
    source: wallet.source as string,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

/** 获取设备关联的所有钱包（简化数据，不含代币余额） */
export async function getDeviceWallets(deviceId: string): Promise<SimpleWallet[]> {
  // Fetch subscriptions and wallets separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
  });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  const simpleWallets: SimpleWallet[] = [];
  for (const sub of subscriptions) {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) continue;
    simpleWallets.push({
      id: wallet.id,
      name: wallet.alias,
      source: wallet.source as string,
      createdAt: wallet.createdAt,
    });
  }

  return simpleWallets;
}

/** 获取所有系统钱包（搜索+分页，供充值管理等场景使用） */
export async function getAllWallets(
  filter: { search?: string; page?: number; limit?: number }
): Promise<{ wallets: SimpleWallet[]; total: number }> {
  const page = filter.page || 1;
  const limit = Math.min(filter.limit || 20, 100);
  const search = filter.search || "";

  const where: any = {};
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { alias: { contains: search, mode: "insensitive" } },
    ];
  }

  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.wallet.count({ where }),
  ]);

  return {
    wallets: wallets.map((w: any) => ({
      id: w.id,
      name: w.alias,
      source: w.source as string,
      createdAt: w.createdAt,
    })),
    total,
  };
}

/** 获取设备关联的所有钱包（聚合数据：含网络列表，不含代币余额） */
export async function getDeviceWalletsAggregate(deviceId: string): Promise<AggregateWallet[]> {
  // Fetch subscriptions and wallets separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
  });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  // 通过 subscriptions 获取 address_id
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: { in: walletIds }, address_id: { not: "" } },
    select: { wallet_id: true, address_id: true },
  });

  // 然后查 wallets_addresses 获取 chain
  const addressIds = subs.map((s: any) => s.address_id);
  const walletAddresses = await prisma.walletAddress.findMany({
    where: { id: { in: addressIds } },
    select: { id: true, chain: true },
  });

  // Build address_id → chain map
  const addressChainMap = new Map<string, string>();
  for (const wa of walletAddresses) {
    addressChainMap.set(wa.id, wa.chain);
  }

  // Group by walletId, deduplicate chains
  const networksMap = new Map<string, Set<string>>();
  for (const sub of subs) {
    const chain = addressChainMap.get(sub.address_id);
    if (!chain) continue;
    const set = networksMap.get(sub.wallet_id) || new Set<string>();
    set.add(chain);
    networksMap.set(sub.wallet_id, set);
  }

  const aggregateWallets: AggregateWallet[] = [];
  for (const sub of subscriptions) {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) continue;
    aggregateWallets.push({
      id: wallet.id,
      name: wallet.alias,
      source: wallet.source as string,
      createdAt: wallet.createdAt,
      networks: Array.from(networksMap.get(wallet.id) || new Set<string>()),
    });
  }

  return aggregateWallets;
}

/** 获取钱包余额详情（总余额+各代币余额，合并原两个接口） */
export async function getWalletBalanceDetail(walletId: string): Promise<WalletBalanceDetail> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });
  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(walletId);

  // Compute total USD value
  const usdtFiat = await prisma.fiatCurrency.findUnique({ where: { code: "USD" } });
  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  let totalUsd = 0;
  for (const tb of tokenBalances) {
    totalUsd += parseFloat(tb.balance) * usdRate;
  }

  return {
    totalBalanceUsd: totalUsd.toFixed(2),
    totalBalanceCny,
    assets: tokenBalances.map((tb) => ({
      id: tb.id,
      assetId: tb.tokenId,
      symbol: tb.symbol,
      name: tb.name,
      balance: tb.balance,
      usdValue: tb.usdValue,
      cnyValue: tb.cnyValue,
      decimals: tb.decimals,
      type: tb.type,
      chain: tb.network,
      tokenId: tb.tokenId,
      iconUrl: tb.iconUrl,
    })),
  };
}

/** 获取钱包详情 */
export async function getWalletDetail(
  walletId: string,
  deviceId: string
): Promise<WalletDetail> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });

  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);

  return {
    id: wallet.id,
    name: wallet.alias,
    source: wallet.source as string,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/**
 * 删除钱包（取消当前设备的订阅）
 * 删除该设备对该钱包的所有订阅记录（地址级）。
 * 钱包记录和 wallets_addresses 永远保留，以便相同助记词重新导入时恢复。
 */
export async function deleteWallet(
  walletId: string,
  deviceId: string
): Promise<void> {
  const result = await prisma.walletSubscription.deleteMany({
    where: {
      wallet_id: walletId,
      device_id: deviceId,
    },
  });

  if (result.count === 0) {
    throw createError(404, "该设备未订阅此钱包");
  }

  logger.info("WALLET", `删除钱包订阅: walletId=${walletId}, deviceId=${deviceId.slice(0, 8)}..., 删除 ${result.count} 条订阅`);

  // 不删除 wallets、wallets_addresses、assets_addresses
  // 钱包永远保留，以便相同助记词重新导入时恢复
}

// ─── WalletAddress 管理 ──────────────────────────────────────────────────────

export interface WalletAddressResult {
  id: string;
  chain: string;
  address: string;
  createdAt: Date;
}

/**
 * 同步地址到服务端 wallets_addresses 表。
 * 客户端创建账户后调用此接口。
 * 同时为该地址自动创建默认资产的 assets_addresses 记录。
 * 地址与钱包的关联通过 wallet_subscriptions 实现。
 */
export async function addWalletAddress(
  walletId: string,
  deviceId: string,
  chain: string,
  address: string
): Promise<WalletAddressResult> {
  logger.info("WALLET", `同步地址: walletId=${walletId}, chain=${chain}, address=${address}`);

  // 检查钱包是否存在
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // 1. 查找或创建 wallets_addresses（unique on chain+address）
  const existing = await prisma.walletAddress.findUnique({
    where: {
      chain_address: { chain, address },
    },
  });

  let walletAddress;
  if (existing) {
    walletAddress = existing;
  } else {
    walletAddress = await prisma.walletAddress.create({
      data: { chain, address },
    });
  }

  // 2. 创建 wallet_subscription（wallet_id + chain + address_id）
  // 地址级订阅是钱包级的，不按 device_id 去重：
  // 同一助记词在不同设备派生出相同地址，订阅已存在则跳过，
  // 这样所有设备共享同一地址的交易记录和余额。
  const existingSub = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      chain,
      address_id: walletAddress.id,
      device_id: deviceId,
    },
  });

  if (!existingSub) {
    await prisma.walletSubscription.create({
      data: {
        wallet_id: walletId,
        device_id: deviceId,
        chain,
        address_id: walletAddress.id,
      },
    });
  }

  // 3. 创建 assets_addresses 默认资产记录（加 chain 字段）
  const defaultAssets = await prisma.asset.findMany({
    where: { isActive: true, chain, isDefault: true },
  });

  for (const asset of defaultAssets) {
    await prisma.assetsAddress.upsert({
      where: {
        addressId_assetId: { addressId: walletAddress.id, assetId: asset.id },
      },
      update: {},
      create: {
        addressId: walletAddress.id,
        assetId: asset.id,
        chain,
        balance: 0,
      },
    });
    logger.info("WALLET", `自动添加资产: asset=${asset.symbol} (${asset.type}), addressId=${walletAddress.id}`);
  }

  return {
    id: walletAddress.id,
    chain: walletAddress.chain,
    address: walletAddress.address,
    createdAt: walletAddress.createdAt,
  };
}

/**
 * 删除服务端的地址订阅（客户端删除账户时同步调用）。
 * 地址级订阅是钱包级的、跨设备共享的，删除时按 wallet_id + address_id 操作。
 * 只删除 wallet_subscription，不删除 wallets_addresses 和 assets_addresses。
 */
export async function deleteWalletAddress(
  walletId: string,
  _deviceId: string,
  addressId: string
): Promise<void> {
  logger.info("WALLET", `删除地址订阅: walletId=${walletId}, addressId=${addressId}`);

  // 地址级订阅是钱包级的，不按 device_id 过滤
  const result = await prisma.walletSubscription.deleteMany({
    where: {
      wallet_id: walletId,
      address_id: addressId,
    },
  });

  if (result.count === 0) {
    throw createError(404, "地址订阅不存在", "SUBSCRIPTION_NOT_FOUND");
  }

  // 不删除 wallets_addresses 和 assets_addresses
}

/**
 * 获取钱包的所有链上地址（服务端视角）。
 * 通过 wallet_subscriptions 获取地址列表。
 */
export async function getWalletAddresses(walletId: string): Promise<WalletAddressResult[]> {
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: walletId, address_id: { not: "" } },
  });
  const addressIds = subs.map((s: any) => s.address_id);

  if (addressIds.length === 0) {
    return [];
  }

  const addresses = await prisma.walletAddress.findMany({
    where: { id: { in: addressIds } },
    orderBy: { createdAt: "asc" },
  });

  return addresses.map((wa: any) => ({
    id: wa.id,
    chain: wa.chain,
    address: wa.address,
    createdAt: wa.createdAt,
  }));
}