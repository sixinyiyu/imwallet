import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface RechargeInput {
  walletId: string;
  tokenSymbol: string;
  amount: string;
  memo?: string;
}

export interface RechargeDeviceInfo {
  deviceId: string;
  platform: string;
  version?: string | null;
}

export interface RechargeResult {
  id: string;
  walletId: string;
  walletAlias: string;
  walletAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  memo: string;
  deviceId: string;
  platform: string;
  version: string | null;
  createdAt: Date;
}

export interface RechargeListFilter {
  page?: number;
  limit?: number;
  walletId?: string;
  tokenSymbol?: string;
}

/**
 * 充值：对系统内钱包的指定代币增加余额，并记录充值日志。
 * 仅允许 recharge_allowed_devices 配置中的设备操作。
 */
export async function recharge(
  input: RechargeInput,
  deviceInfo: RechargeDeviceInfo
): Promise<RechargeResult> {
  const { walletId, tokenSymbol, amount, memo } = input;

  logger.info("RECHARGE", `充值请求: walletId=${walletId}, tokenSymbol=${tokenSymbol}, amount=${amount}, deviceId=${deviceInfo.deviceId.slice(0, 8)}...`);

  // 1. 校验设备是否有充值权限
  const allowedConfig = await prisma.appConfig.findUnique({
    where: { key: "recharge_allowed_devices" },
  });

  let allowedDevices: string[] = [];
  if (allowedConfig?.value) {
    try {
      const parsed = JSON.parse(allowedConfig.value);
      if (Array.isArray(parsed)) {
        allowedDevices = parsed.filter((v) => typeof v === "string");
      }
    } catch {
      // JSON 解析失败，视为空列表
    }
  }

  if (!allowedDevices.includes(deviceInfo.deviceId)) {
    logger.warn("RECHARGE", `充值失败: 设备无权限 - deviceId=${deviceInfo.deviceId.slice(0, 8)}...`);
    throw createError(403, "当前设备无充值权限", "RECHARGE_DEVICE_NOT_ALLOWED");
  }

  // 2. 查找钱包
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // 3. 查找代币
  const token = await prisma.token.findUnique({
    where: { symbol: tokenSymbol },
  });
  if (!token) {
    throw createError(404, "代币不存在", "TOKEN_NOT_FOUND");
  }

  // 4. 获取或创建 WalletToken 记录，增加余额
  const walletToken = await prisma.walletToken.upsert({
    where: {
      walletId_tokenId: { walletId, tokenId: token.id },
    },
    update: {
      balance: { increment: parseFloat(amount) },
    },
    create: {
      walletId,
      tokenId: token.id,
      balance: parseFloat(amount),
    },
  });

  logger.info("RECHARGE", `余额更新成功: walletTokenId=${walletToken.id}, newBalance=${walletToken.balance}`);

  // 5. 写入充值记录
  const record = await prisma.recharge.create({
    data: {
      walletId,
      walletAlias: wallet.alias,
      walletAddress: wallet.address,
      tokenSymbol,
      tokenName: token.name,
      amount: parseFloat(amount),
      memo: memo || "",
      deviceId: deviceInfo.deviceId,
      platform: deviceInfo.platform,
      version: deviceInfo.version || null,
    },
  });

  logger.info("RECHARGE", `充值成功: recordId=${record.id}, wallet=${wallet.alias}, token=${tokenSymbol}, amount=${amount}`);

  return {
    id: record.id,
    walletId: record.walletId,
    walletAlias: record.walletAlias,
    walletAddress: record.walletAddress,
    tokenSymbol: record.tokenSymbol,
    tokenName: record.tokenName,
    amount: record.amount.toString(),
    memo: record.memo,
    deviceId: record.deviceId,
    platform: record.platform,
    version: record.version,
    createdAt: record.createdAt,
  };
}

/**
 * 分页查询充值记录
 */
export async function getRecharges(
  filter: RechargeListFilter
): Promise<{ recharges: RechargeResult[]; total: number }> {
  const page = filter.page || 1;
  const limit = Math.min(filter.limit || 20, 100);

  const where: any = {};
  if (filter.walletId) {
    where.walletId = filter.walletId;
  }
  if (filter.tokenSymbol) {
    where.tokenSymbol = filter.tokenSymbol;
  }

  const [records, total] = await Promise.all([
    prisma.recharge.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recharge.count({ where }),
  ]);

  return {
    recharges: records.map((r: any) => ({
      id: r.id,
      walletId: r.walletId,
      walletAlias: r.walletAlias,
      walletAddress: r.walletAddress,
      tokenSymbol: r.tokenSymbol,
      tokenName: r.tokenName,
      amount: r.amount.toString(),
      memo: r.memo,
      deviceId: r.deviceId,
      platform: r.platform,
      version: r.version,
      createdAt: r.createdAt,
    })),
    total,
  };
}
