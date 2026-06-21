import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { decryptPassword as rsaDecryptPassword } from "../services/rsaService";
import { deriveAddressFromMnemonic } from "../services/derivationService";

/**
 * Generate a wallet identifier: aqud + 32 random Base62 characters
 */
export function generateIdentifier(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let identifier = "aqud";
  for (let i = 0; i < 32; i++) {
    identifier += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return identifier;
}

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
  identifier: string;
  alias: string;
  source: string;
  accountCount: number;
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
  identifier: string;
  alias: string;
  source: string;
  accountCount: number;
  createdAt: Date;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}

export interface WalletDetail extends WalletSummary {
  updatedAt: Date;
  passwordHint?: string;
}

/**
 * Generate a deterministic mnemonic hash from a seed.
 * For CREATE wallets (no mnemonic), we use a hash-based derivation.
 * For IMPORT wallets, use BIP39/BIP44 deterministic derivation via derivationService.
 */
export function deriveMnemonicHash(seed: string, index: number): string {
  const hash = createHash("sha256")
    .update(`${seed}-${index}`)
    .digest("hex");

  return "0x" + hash.slice(0, 40).toUpperCase();
}

/**
 * Compute wallet's asset balances by aggregating all account_assets under this wallet.
 */
async function computeTokenBalances(walletId: string): Promise<{
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}> {
  // 1. Find all accounts under this wallet
  const accounts = await prisma.account.findMany({
    where: { walletId },
    select: { id: true },
  });
  const accountIds = accounts.map((a: any) => a.id);

  if (accountIds.length === 0) {
    return { tokenBalances: [], totalBalanceCny: "0.00" };
  }

  // 2. Fetch all account_assets for these accounts
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

  // 5. Aggregate balances by asset (sum across accounts)
  const balanceMap = new Map<string, number>();
  for (const aa of accountAssets) {
    const current = balanceMap.get(aa.assetId) || 0;
    balanceMap.set(aa.assetId, current + parseFloat(aa.balance.toString()));
  }

  let totalCny = 0;
  const tokenBalances: WalletTokenBalance[] = [];

  for (const [assetId, totalBalance] of balanceMap) {
    const ast = assetMap.get(assetId);
    if (!ast) continue;
    const balance = totalBalance.toFixed(8).replace(/\.?0+$/, "");
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

/** 创建/导入钱包并自动关联设备（统一接口） */
export async function createOrImportWallet(
  deviceId: string,
  source: "CREATE" | "IMPORT",
  alias: string,
  encryptedPassword: string,
  passwordHint?: string,
  mnemonic?: string,
  privateKey?: string
): Promise<WalletDetail> {
  logger.info("WALLET", `${source === "IMPORT" ? "导入" : "创建"}钱包: deviceId=${deviceId.slice(0, 8)}..., alias=${alias}`);

  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "设备未注册，请重新登录", "DEVICE_NOT_FOUND");
  }

  // 解密 RSA 加密的密码
  let rawPassword: string;
  try {
    rawPassword = rsaDecryptPassword(encryptedPassword);
  } catch {
    throw createError(400, "密码解密失败，请重试", "PASSWORD_DECRYPT_FAILED");
  }
  if (rawPassword.length < 8) {
    throw createError(400, "密码至少需要8个字符", "PASSWORD_TOO_SHORT");
  }

  // bcrypt 哈希
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Derive mnemonic hash (mnemonic is always provided by the client)
  const mnemonicHash = await deriveAddressFromMnemonic(mnemonic!, "Ethereum", 0);
  const identifier = generateIdentifier();

  // 检查地址是否已存在（同一助记词可能已被导入过）
  const existingWallet = await prisma.wallet.findFirst({
    where: { mnemonicHash },
  });

  if (existingWallet) {
    // 地址已存在，检查当前设备是否已订阅该钱包
    const existingSub = await prisma.walletSubscription.findFirst({
      where: {
        wallet_id: existingWallet.id,
        device_id: device.id,
      },
    });

    if (existingSub) {
      // 当前设备已订阅该钱包
      throw createError(409, "钱包已存在于当前设备", "WALLET_ALREADY_EXISTS");
    }

    // 当前设备未订阅，自动添加订阅（多设备共享同一钱包）
    logger.info("WALLET", `钱包地址已存在，为当前设备添加订阅: walletId=${existingWallet.id}, deviceId=${deviceId.slice(0, 8)}...`);
    await prisma.walletSubscription.create({
      data: {
        wallet_id: existingWallet.id,
        device_id: device.id,
      },
    });

    const { tokenBalances, totalBalanceCny } = await computeTokenBalances(existingWallet.id);
    const accountCount = await prisma.account.count({ where: { walletId: existingWallet.id } });

    return {
      id: existingWallet.id,
      identifier: existingWallet.identifier,
      alias: existingWallet.alias,
      source: existingWallet.source as string,
      accountCount,
      createdAt: existingWallet.createdAt,
      updatedAt: existingWallet.updatedAt,
      tokenBalances,
      totalBalanceCny,
    };
  }

  // 地址不存在，创建新钱包（不使用 nested write，分步创建）
  const wallet = await prisma.wallet.create({
    data: {
      identifier,
      alias,
      mnemonicHash,
      source,
      password: passwordHash,
       passwordHint: passwordHint || '',    },
  });

  // 创建钱包-设备订阅关系（不使用 nested create）
  await prisma.walletSubscription.create({
    data: {
      wallet_id: wallet.id,
      device_id: device.id,
    },
  });

  logger.info("WALLET", `${source === "IMPORT" ? "导入" : "创建"}钱包成功: walletId=${wallet.id}, identifier=${identifier}, mnemonicHash=${mnemonicHash}`);

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);
  const accountCount = await prisma.account.count({ where: { walletId: wallet.id } });

  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    source: wallet.source as string,
    accountCount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/** 重置钱包密码（通过助记词验证身份后更新密码） */
export async function resetWalletPassword(
  walletId: string,
  mnemonic: string,
  encryptedPassword: string,
  passwordHint?: string
): Promise<WalletDetail> {
  logger.info("WALLET", `重置密码: walletId=${walletId}`);

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });
  if (!wallet) {
    throw createError(404, "钱包不存在");
  }

  // Verify mnemonic matches the wallet mnemonic hash
  const derivedHash = await deriveAddressFromMnemonic(mnemonic, "Ethereum", 0);
  if (derivedHash !== wallet.mnemonicHash) {
    throw createError(400, "助记词与当前钱包不匹配", "MNEMONIC_MISMATCH");
  }

  // Decrypt RSA encrypted password
  let rawPassword: string;
  try {
    rawPassword = rsaDecryptPassword(encryptedPassword);
  } catch {
    throw createError(400, "Password decryption failed", "PASSWORD_DECRYPT_FAILED");
  }
  if (rawPassword.length < 8) {
    throw createError(400, "Password must be at least 8 characters", "PASSWORD_TOO_SHORT");
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Update password
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      password: passwordHash,
      passwordHint: passwordHint || '',
    },
  });

  logger.info("WALLET", `重置密码成功: walletId=${walletId}`);

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(walletId);
  const accountCount = await prisma.account.count({ where: { walletId } });

  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    source: wallet.source as string,
    accountCount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/** 获取设备关联的所有钱包（简化数据，不含代币余额） */
export async function getDeviceWallets(deviceId: string): Promise<SimpleWallet[]> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  // Fetch subscriptions and wallets separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
  });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  // Batch count accounts for all wallets (single query)
  const accountCounts = await prisma.account.groupBy({
    by: ["walletId"],
    where: { walletId: { in: walletIds } },
    _count: { _all: true },
  });
  const accountCountMap = new Map<string, number>(
    accountCounts.map((ac: any) => [ac.walletId, ac._count._all])
  );

  const simpleWallets: SimpleWallet[] = [];
  for (const sub of subscriptions) {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) continue;
    simpleWallets.push({
      id: wallet.id,
      identifier: wallet.identifier,
      alias: wallet.alias,
      source: wallet.source as string,
      accountCount: accountCountMap.get(wallet.id) || 0,
      createdAt: wallet.createdAt,
    });
  }

  return simpleWallets;
}

/** 获取设备关联的所有钱包（聚合数据：含网络列表，不含代币余额） */
export async function getDeviceWalletsAggregate(deviceId: string): Promise<AggregateWallet[]> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  // Fetch subscriptions and wallets separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
  });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  // Batch count accounts for all wallets
  const accountCounts = await prisma.account.groupBy({
    by: ["walletId"],
    where: { walletId: { in: walletIds } },
    _count: { _all: true },
  });
  const accountCountMap = new Map<string, number>(
    accountCounts.map((ac: any) => [ac.walletId, ac._count._all])
  );

  // Batch fetch all accounts for all wallets (single query)
  const allAccounts = await prisma.account.findMany({
    where: { walletId: { in: walletIds } },
    select: { walletId: true, network: true },
  });
  // Group by walletId, deduplicate networks
  const networksMap = new Map<string, Set<string>>();
  for (const acc of allAccounts) {
    const set = networksMap.get(acc.walletId) || new Set<string>();
    set.add(acc.network);
    networksMap.set(acc.walletId, set);
  }

  const aggregateWallets: AggregateWallet[] = [];
  for (const sub of subscriptions) {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) continue;
    aggregateWallets.push({
      id: wallet.id,
      identifier: wallet.identifier,
      alias: wallet.alias,
      source: wallet.source as string,
      accountCount: accountCountMap.get(wallet.id) || 0,
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
  const accountCount = await prisma.account.count({ where: { walletId: wallet.id } });

  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    source: wallet.source as string,
    passwordHint: wallet.passwordHint,
    accountCount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/** 更新钱包别名 */
export async function updateWalletAlias(
  walletId: string,
  alias: string
): Promise<WalletSummary> {
  const wallet = await prisma.wallet.update({
    where: { id: walletId },
    data: { alias },
  });
  const accountCount = await prisma.account.count({ where: { walletId } });
  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(walletId);
  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    source: wallet.source as string,
    accountCount,
    createdAt: wallet.createdAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/** 删除钱包（取消当前设备的订阅，钱包记录保留） */
export async function deleteWallet(
  walletId: string,
  deviceId: string
): Promise<void> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: device.id,
    },
  });

  if (!subscription) {
    throw createError(404, "该设备未订阅此钱包");
  }

  logger.info("WALLET", `删除钱包订阅: walletId=${walletId}, deviceId=${deviceId.slice(0, 8)}...`);

  // 删除订阅关系
  await prisma.walletSubscription.delete({
    where: { id: subscription.id },
  });

  // 如果没有任何设备订阅此钱包，则真正删除钱包
  const remainingSubs = await prisma.walletSubscription.count({
    where: { wallet_id: walletId },
  });

  if (remainingSubs === 0) {
    logger.info("WALLET", `钱包无其他订阅，删除钱包记录: walletId=${walletId}`);
    await prisma.wallet.delete({
      where: { id: walletId },
    });
  }
}

/** 验证钱包密码 */
export async function verifyWalletPassword(
  walletId: string,
  encryptedPassword: string
): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "Wallet not found");
  }

  // RSA 解密客户端发送的密码
  let rawPassword: string;
  try {
    rawPassword = rsaDecryptPassword(encryptedPassword);
  } catch {
    throw createError(400, "Password decryption failed", "PASSWORD_DECRYPT_FAILED");
  }

  // bcrypt 比对
  const match = await bcrypt.compare(rawPassword, wallet.password);
  return match;
}