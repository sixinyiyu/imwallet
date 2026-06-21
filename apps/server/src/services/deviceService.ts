import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface RegisterDeviceInput {
  device_id: string;
  platform: string;
}

export interface DeviceResult {
  id: string;
  platform: string;
  created_at: Date;
  updated_at: Date;
}

/** 注册新设备（精简：只存 id + platform） */
export async function registerDevice(input: RegisterDeviceInput): Promise<DeviceResult> {
  logger.info("DEVICE", `注册设备: device_id=${input.device_id.slice(0, 8)}..., platform=${input.platform}`);

  // 检查设备是否已存在
  const existing = await prisma.device.findUnique({
    where: { id: input.device_id },
  });

  if (existing) {
    logger.info("DEVICE", `设备已存在，返回已有记录 - device_id=${input.device_id.slice(0, 8)}...`);
    return {
      id: existing.id,
      platform: existing.platform as string,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
  }

  const device = await prisma.device.create({
    data: {
      id: input.device_id,
      platform: input.platform as any,
    },
  });

  logger.info("DEVICE", `注册设备成功: id=${device.id.slice(0, 8)}...`);

  return {
    id: device.id,
    platform: device.platform as string,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
}

/** 获取设备信息（精简：只返回 id + platform） */
export async function getDevice(deviceId: string): Promise<DeviceResult> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  return {
    id: device.id,
    platform: device.platform as string,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
}

/** 设备订阅钱包 */
export async function subscribeWallet(
  deviceId: string,
  walletId: string,
  chain?: string,
  addressId?: string
): Promise<{ id: number; wallet_id: string; device_id: string; chain: string; address_id: string }> {
  logger.info("DEVICE", `订阅钱包: device_id=${deviceId.slice(0, 8)}..., wallet_id=${walletId}`);

  // 查找钱包
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
  });
  if (!wallet) {
    throw createError(404, "钱包不存在", "WALLET_NOT_FOUND");
  }

  // 检查是否已订阅
  const existing = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: deviceId,
      chain: chain || '',
      address_id: addressId || '',
    },
  });

  if (existing) {
    throw createError(409, "已订阅该钱包", "ALREADY_SUBSCRIBED");
  }

  const subscription = await prisma.walletSubscription.create({
    data: {
      wallet_id: walletId,
      device_id: deviceId,
      chain: chain || '',
      address_id: addressId || '',
    },
  });

  logger.info("DEVICE", `订阅钱包成功: sub_id=${subscription.id}`);

  return {
    id: subscription.id,
    wallet_id: subscription.wallet_id,
    device_id: subscription.device_id,
    chain: subscription.chain,
    address_id: subscription.address_id,
  };
}

/** 设备取消订阅钱包（删除该设备的所有地址级订阅） */
export async function unsubscribeWallet(deviceId: string, walletId: string): Promise<void> {
  logger.info("DEVICE", `取消订阅钱包: device_id=${deviceId.slice(0, 8)}..., wallet_id=${walletId}`);

  const result = await prisma.walletSubscription.deleteMany({
    where: {
      wallet_id: walletId,
      device_id: deviceId,
    },
  });

  if (result.count === 0) {
    throw createError(404, "订阅关系不存在", "SUBSCRIPTION_NOT_FOUND");
  }

  logger.info("DEVICE", `取消订阅钱包成功: wallet_id=${walletId}, 删除 ${result.count} 条订阅`);
}

/**
 * 获取设备订阅的所有钱包（精简版）
 * 余额查询通过 wallet_subscriptions → wallets_addresses → assets_addresses (address_id) 链路
 */
export async function getDeviceWallets(deviceId: string): Promise<any[]> {
  // Fetch subscriptions separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);

  // Fetch wallets
  const wallets = await prisma.wallet.findMany({ where: { id: { in: walletIds } } });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  // 通过 subscriptions 获取地址
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: { in: walletIds }, address_id: { not: "" } },
    select: { wallet_id: true, address_id: true },
  });
  const addressIds = subs.map((s: any) => s.address_id);

  // Fetch assets_addresses for all addresses
  const assetsAddresses = await prisma.assetsAddress.findMany({ where: { addressId: { in: addressIds } } });
  const assetIds = [...new Set(assetsAddresses.map((aa: any) => aa.assetId))];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
  const assetMap = new Map<string, any>(assets.map((a: any) => [a.id, a]));

  // Build address → wallet mapping (via subscriptions)
  const addressToWallet = new Map<string, string>();
  for (const sub of subs) {
    addressToWallet.set(sub.address_id, sub.wallet_id);
  }

  // Group assetsAddresses by walletId
  const assetsByWallet = new Map<string, any[]>();
  for (const aa of assetsAddresses) {
    const wid = addressToWallet.get(aa.addressId);
    if (!wid) continue;
    const list = assetsByWallet.get(wid) || [];
    list.push(aa);
    assetsByWallet.set(wid, list);
  }

  return subscriptions.map((sub: any) => {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) return null;
    const aas = assetsByWallet.get(wallet.id) || [];
    return {
      subscription_id: sub.id,
      chain: sub.chain,
      address_id: sub.address_id,
      wallet: {
        id: wallet.id,
        name: wallet.alias,
        source: wallet.source,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        tokenBalances: aas.map((ab: any) => {
          const ast = assetMap.get(ab.assetId);
          return {
            id: ab.id,
            symbol: ast?.symbol || "",
            name: ast?.name || "",
            balance: ab.balance.toString(),
            decimals: ast?.decimals || 6,
            network: ast?.chain || "",
          };
        }),
      },
    };
  }).filter(Boolean);
}