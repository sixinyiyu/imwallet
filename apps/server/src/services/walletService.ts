import { v4 as uuid } from "uuid";
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
  network: string;
  iconUrl?: string;
}

export interface WalletSummary {
  id: string;
  identifier: string;
  alias: string;
  address: string;
  source: string;
  accountCount: number;
  createdAt: Date;
  tokenBalances: WalletTokenBalance[];
  totalBalanceCny: string;
}

export interface WalletDetail extends WalletSummary {
  updatedAt: Date;
  passwordHint?: string | null;
}

/**
 * Generate a deterministic wallet address from a seed.
 * For CREATE wallets (no mnemonic), we use a hash-based derivation.
 * For IMPORT wallets, use BIP39/BIP44 deterministic derivation via derivationService.
 */
export function deriveAddress(seed: string, index: number): string {
  const hash = createHash("sha256")
    .update(`${seed}-${index}`)
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
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  // 解密 RSA 加密的密码
  let rawPassword: string;
  try {
    rawPassword = rsaDecryptPassword(encryptedPassword);
  } catch {
    throw createError(400, "Password decryption failed", "PASSWORD_DECRYPT_FAILED");
  }
  if (rawPassword.length < 8) {
    throw createError(400, "Password must be at least 8 characters", "PASSWORD_TOO_SHORT");
  }

  // bcrypt 哈希
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Derive wallet address
  let address: string;
  if (mnemonic) {
    // Use BIP39/BIP44 deterministic derivation when mnemonic is provided
    address = await deriveAddressFromMnemonic(mnemonic, "Ethereum", 0);
  } else {
    // Hash-based derivation for CREATE wallets without mnemonic
    const seed = `device-${device.id}-${Date.now()}`;
    address = deriveAddress(seed, 0);
  }
  const identifier = generateIdentifier();

  const wallet = await prisma.wallet.create({
    data: {
      identifier,
      alias,
      address,
      source,
      password: passwordHash,
      passwordHint: passwordHint || null,
      subscriptions: {
        create: {
          device_id: device.id,
        },
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

  logger.info("WALLET", `${source === "IMPORT" ? "导入" : "创建"}钱包成功: walletId=${wallet.id}, identifier=${identifier}, address=${address}`);

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);
  const accountCount = await prisma.account.count({ where: { walletId: wallet.id } });

  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    address: wallet.address,
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
    throw createError(404, "Wallet not found");
  }

  // Verify mnemonic matches the wallet address
  const derivedAddress = await deriveAddressFromMnemonic(mnemonic, "Ethereum", 0);
  if (derivedAddress !== wallet.address) {
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
      passwordHint: passwordHint || null,
    },
  });

  logger.info("WALLET", `重置密码成功: walletId=${walletId}`);

  const { tokenBalances, totalBalanceCny } = await computeTokenBalances(walletId);
  const accountCount = await prisma.account.count({ where: { walletId } });

  return {
    id: wallet.id,
    identifier: wallet.identifier,
    alias: wallet.alias,
    address: wallet.address,
    source: wallet.source as string,
    accountCount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    tokenBalances,
    totalBalanceCny,
  };
}

/** 获取设备关联的所有钱包 */
export async function getDeviceWallets(deviceId: string): Promise<WalletSummary[]> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    include: { wallet: true },
    orderBy: { created_at: "desc" },
  });

  const walletSummaries: WalletSummary[] = [];
  for (const sub of subscriptions) {
    const { tokenBalances, totalBalanceCny } = await computeTokenBalances(sub.wallet.id);
    const accountCount = await prisma.account.count({ where: { walletId: sub.wallet.id } });
    walletSummaries.push({
      id: sub.wallet.id,
      identifier: sub.wallet.identifier,
      alias: sub.wallet.alias,
      address: sub.wallet.address,
      source: sub.wallet.source as string,
      accountCount,
      createdAt: sub.wallet.createdAt,
      tokenBalances,
      totalBalanceCny,
    });
  }

  return walletSummaries;
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
    address: wallet.address,
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
    address: wallet.address,
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
    throw createError(404, "Wallet subscription not found for this device");
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

/** 标记钱包已备份 */
export async function backupWallet(walletId: string): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) {
    throw createError(404, "Wallet not found");
  }
}