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
  // Fetch WalletTokens and Tokens separately (no relation include)
  const walletTokens = await prisma.walletToken.findMany({
    where: { walletId },
  });

  const tokenIds = walletTokens.map((wt: any) => wt.tokenId);
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
  });
  const tokenMap = new Map(tokens.map((t: any) => [t.id, t]));

  const [usdtFiat, cnyFiat] = await Promise.all([
    prisma.fiatCurrency.findUnique({ where: { code: "USD" } }),
    prisma.fiatCurrency.findUnique({ where: { code: "CNY" } }),
  ]);

  const usdRate = usdtFiat ? parseFloat(usdtFiat.rate.toString()) : 1;
  const cnyRate = cnyFiat ? parseFloat(cnyFiat.rate.toString()) : 7.25;

  let totalCny = 0;

  const tokenBalances: WalletTokenBalance[] = walletTokens.map((wt: any) => {
    const tk = tokenMap.get(wt.tokenId);
    const balance = wt.balance.toString();
    const usdValue = (parseFloat(balance) * usdRate).toFixed(2);
    const cnyValue = (parseFloat(balance) * cnyRate).toFixed(2);
    totalCny += parseFloat(balance) * cnyRate;

    return {
      id: wt.id,
      tokenId: wt.tokenId,
      symbol: tk?.symbol || "",
      name: tk?.name || "",
      balance,
      usdValue,
      cnyValue,
      decimals: tk?.decimals || 6,
      network: tk?.network || "",
      iconUrl: tk?.iconUrl || undefined,
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

  // 检查地址是否已存在（同一助记词可能已被导入过）
  const existingWallet = await prisma.wallet.findUnique({
    where: { address },
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
      address: existingWallet.address,
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
      address,
      source,
      password: passwordHash,
      passwordHint: passwordHint || null,
    },
  });

  // 创建钱包-设备订阅关系（不使用 nested create）
  await prisma.walletSubscription.create({
    data: {
      wallet_id: wallet.id,
      device_id: device.id,
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
    throw createError(404, "钱包不存在");
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

  // Fetch subscriptions and wallets separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
  });
  const walletMap = new Map(wallets.map((w: any) => [w.id, w]));

  const walletSummaries: WalletSummary[] = [];
  for (const sub of subscriptions) {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) continue;
    const { tokenBalances, totalBalanceCny } = await computeTokenBalances(wallet.id);
    const accountCount = await prisma.account.count({ where: { walletId: wallet.id } });
    walletSummaries.push({
      id: wallet.id,
      identifier: wallet.identifier,
      alias: wallet.alias,
      address: wallet.address,
      source: wallet.source as string,
      accountCount,
      createdAt: wallet.createdAt,
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