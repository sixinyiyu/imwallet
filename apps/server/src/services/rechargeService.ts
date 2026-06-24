import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface RechargeInput {
  walletId: string;
  walletAlias: string;
  tokenSymbol: string;
  network: string;
  accountAddress: string;
  amount: string;
  memo?: string;
}

export interface RechargeDeviceInfo {
  deviceId: string;
  platform: string;
  version?: string;
}

export interface RechargeResult {
  id: string;
  walletId: string;
  walletAlias: string;
  accountAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  memo: string;
  deviceId: string;
  platform: string;
  version: string;
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
 * 余额操作通过 wallet_subscriptions → wallets_addresses → assets_addresses (address_id) 链路。
 */
export async function recharge(
  input: RechargeInput,
  deviceInfo: RechargeDeviceInfo
): Promise<RechargeResult> {
  const { walletId, walletAlias, tokenSymbol, network, accountAddress, amount, memo } = input;

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

  // 3. 查找资产（symbol + chain 复合查询）
  const asset = await prisma.asset.findFirst({
    where: { symbol: tokenSymbol, chain: network },
  });
  if (!asset) {
    throw createError(404, "资产不存在", "ASSET_NOT_FOUND");
  }

  // 4. 通过 accountAddress 查找 wallets_addresses 记录
  const walletAddress = await prisma.walletAddress.findFirst({
    where: { address: accountAddress, chain: network },
  });
  if (!walletAddress) {
    throw createError(404, "该地址在系统中不存在", "ADDRESS_NOT_FOUND");
  }

  // 4-5. 余额更新 + 充值记录写入事务，防止并发充值导致余额不一致
  const [assetsAddress, record] = await prisma.$transaction(async (tx: any) => {
    // 4. 余额更新（upsert 在事务内）
    const aa = await tx.assetsAddress.upsert({
      where: {
        addressId_assetId: { addressId: walletAddress.id, assetId: asset.id },
      },
      update: {
        balance: { increment: parseFloat(amount) },
      },
      create: {
        addressId: walletAddress.id,
        assetId: asset.id,
        chain: network,
        balance: parseFloat(amount),
      },
    });

    logger.info("RECHARGE", `余额更新成功: assetsAddressId=${aa.id}, newBalance=${aa.balance}`);

    // 5. 写入充值记录
    const rec = await tx.recharge.create({
      data: {
        walletId,
        walletAlias: walletAlias || wallet.alias || wallet.id,
        accountAddress: accountAddress,
        tokenSymbol,
        tokenName: asset.name,
        amount: parseFloat(amount),
        memo: memo || "",
        deviceId: deviceInfo.deviceId,
        platform: deviceInfo.platform,
        version: deviceInfo.version || "",
      },
    });

    logger.info("RECHARGE", `充值成功: recordId=${rec.id}, wallet=${wallet.id}, token=${tokenSymbol}, amount=${amount}`);

    return [aa, rec];
  });

  return {
    id: record.id,
    walletId: record.walletId,
    walletAlias: record.walletAlias,
    accountAddress: record.accountAddress,
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
      accountAddress: r.accountAddress,
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