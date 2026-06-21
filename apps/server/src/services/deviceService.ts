import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface RegisterDeviceInput {
  device_id: string;
  platform: string;
  platform_store?: string;
  os?: string;
  model?: string;
  locale?: string;
  version?: string;
  currency?: string;
}

export interface UpdateDeviceInput {
  platform?: string;
  platform_store?: string;
  os?: string;
  model?: string;
  locale?: string;
  version?: string;
  currency?: string;
  token?: string;
  is_push_enabled?: boolean;
  is_price_alerts_enabled?: boolean;
}

export interface DeviceResult {
  id: number;
  device_id: string;
  platform: string;
  platform_store: string;
  os: string;
  model: string;
  locale: string;
  version: string;
  currency: string;
  token: string;
  is_push_enabled: boolean;
  is_price_alerts_enabled: boolean;
  subscriptions_version: number;
  created_at: Date;
  updated_at: Date;
}

/** 注册新设备 */
export async function registerDevice(input: RegisterDeviceInput): Promise<DeviceResult> {
  logger.info("DEVICE", `注册设备: device_id=${input.device_id.slice(0, 8)}..., platform=${input.platform}`);

  // 检查设备是否已存在
  const existing = await prisma.device.findUnique({
    where: { device_id: input.device_id },
  });

  if (existing) {
    logger.info("DEVICE", `设备已存在，返回已有记录 - device_id=${input.device_id.slice(0, 8)}...`);
    return {
      id: existing.id,
      device_id: existing.device_id,
      platform: existing.platform as string,
      platform_store: existing.platform_store as string,
      os: existing.os,
      model: existing.model,
      locale: existing.locale,
      version: existing.version,
      currency: existing.currency,
      token: existing.token,
      is_push_enabled: existing.is_push_enabled,
      is_price_alerts_enabled: existing.is_price_alerts_enabled,
      subscriptions_version: existing.subscriptions_version,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
  }

  const device = await prisma.device.create({
    data: {
      device_id: input.device_id,
      platform: input.platform as any,
      platform_store: input.platform_store as any || '',
      os: input.os || '',
      model: input.model || '',
      locale: input.locale || '',
      version: input.version || '',
      currency: input.currency || '',
    },
  });

  logger.info("DEVICE", `注册设备成功: id=${device.id}, device_id=${device.device_id.slice(0, 8)}...`);

  return {
    id: device.id,
    device_id: device.device_id,
    platform: device.platform as string,
    platform_store: device.platform_store as string,
    os: device.os,
    model: device.model,
    locale: device.locale,
    version: device.version,
    currency: device.currency,
    token: device.token,
    is_push_enabled: device.is_push_enabled,
    is_price_alerts_enabled: device.is_price_alerts_enabled,
    subscriptions_version: device.subscriptions_version,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
}

/** 更新设备信息（需签名验证） */
export async function updateDevice(deviceId: string, input: UpdateDeviceInput): Promise<DeviceResult> {
  logger.info("DEVICE", `更新设备: device_id=${deviceId.slice(0, 8)}...`);

  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });

  if (!device) {
    throw createError(404, "设备未注册，请重新登录", "DEVICE_NOT_FOUND");
  }

  const updateData: any = {};
  if (input.platform) updateData.platform = input.platform;
  if (input.platform_store) updateData.platform_store = input.platform_store;
  if (input.os) updateData.os = input.os;
  if (input.model) updateData.model = input.model;
  if (input.locale) updateData.locale = input.locale;
  if (input.version) updateData.version = input.version;
  if (input.currency) updateData.currency = input.currency;
  if (input.token) updateData.token = input.token;
  if (input.is_push_enabled !== undefined) updateData.is_push_enabled = input.is_push_enabled;
  if (input.is_price_alerts_enabled !== undefined) updateData.is_price_alerts_enabled = input.is_price_alerts_enabled;

  const updated = await prisma.device.update({
    where: { device_id: deviceId },
    data: updateData,
  });

  logger.info("DEVICE", `更新设备成功: device_id=${deviceId.slice(0, 8)}...`);

  return {
    id: updated.id,
    device_id: updated.device_id,
    platform: updated.platform as string,
    platform_store: updated.platform_store as string,
    os: updated.os,
    model: updated.model,
    locale: updated.locale,
    version: updated.version,
    currency: updated.currency,
    token: updated.token,
    is_push_enabled: updated.is_push_enabled,
    is_price_alerts_enabled: updated.is_price_alerts_enabled,
    subscriptions_version: updated.subscriptions_version,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  };
}

/** 获取设备信息 */
export async function getDevice(deviceId: string): Promise<DeviceResult> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });

  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  return {
    id: device.id,
    device_id: device.device_id,
    platform: device.platform as string,
    platform_store: device.platform_store as string,
    os: device.os,
    model: device.model,
    locale: device.locale,
    version: device.version,
    currency: device.currency,
    token: device.token,
    is_push_enabled: device.is_push_enabled,
    is_price_alerts_enabled: device.is_price_alerts_enabled,
    subscriptions_version: device.subscriptions_version,
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
): Promise<{ id: number; wallet_id: string; device_id: number; chain: string; address_id: string }> {
  logger.info("DEVICE", `订阅钱包: device_id=${deviceId.slice(0, 8)}..., wallet_id=${walletId}`);

  // 查找设备
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

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
      device_id: device.id,
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
      device_id: device.id,
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

/** 设备取消订阅钱包 */
export async function unsubscribeWallet(deviceId: string, walletId: string): Promise<void> {
  logger.info("DEVICE", `取消订阅钱包: device_id=${deviceId.slice(0, 8)}..., wallet_id=${walletId}`);

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
    throw createError(404, "订阅关系不存在", "SUBSCRIPTION_NOT_FOUND");
  }

  await prisma.walletSubscription.delete({
    where: { id: subscription.id },
  });

  logger.info("DEVICE", `取消订阅钱包成功: wallet_id=${walletId}`);
}

/** 获取设备订阅的所有钱包（不使用 relation include，手动查询关联数据） */
export async function getDeviceWallets(deviceId: string): Promise<any[]> {
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  // Fetch subscriptions separately (no relation include)
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: device.id },
    orderBy: { created_at: "desc" },
  });

  const walletIds = subscriptions.map((sub: any) => sub.wallet_id);

  // Fetch wallets, accounts, accountAssets, and assets separately
  const wallets = await prisma.wallet.findMany({ where: { id: { in: walletIds } } });
  const walletMap = new Map<string, any>(wallets.map((w: any) => [w.id, w]));

  const accounts = await prisma.account.findMany({ where: { walletId: { in: walletIds } } });
  const accountIds = accounts.map((a: any) => a.id);

  const accountAssets = await prisma.accountAsset.findMany({ where: { accountId: { in: accountIds } } });
  const assetIds = [...new Set(accountAssets.map((aa: any) => aa.assetId))];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } } });
  const assetMap = new Map<string, any>(assets.map((a: any) => [a.id, a]));

  // Build account → wallet mapping
  const accountToWallet = new Map<string, string>();
  for (const acc of accounts) {
    accountToWallet.set(acc.id, acc.walletId);
  }

  // Group accountAssets by walletId
  const accountAssetsByWallet = new Map<string, any[]>();
  for (const aa of accountAssets) {
    const wid = accountToWallet.get(aa.accountId);
    if (!wid) continue;
    const list = accountAssetsByWallet.get(wid) || [];
    list.push(aa);
    accountAssetsByWallet.set(wid, list);
  }

  const accountsByWallet = new Map<string, number>();
  for (const acc of accounts) {
    accountsByWallet.set(acc.walletId, (accountsByWallet.get(acc.walletId) || 0) + 1);
  }

  return subscriptions.map((sub: any) => {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) return null;
    const aas = accountAssetsByWallet.get(wallet.id) || [];
    return {
      subscription_id: sub.id,
      chain: sub.chain,
      address_id: sub.address_id,
      wallet: {
        id: wallet.id,
        identifier: wallet.identifier,
        alias: wallet.alias,
        source: wallet.source,
        memo: wallet.memo,
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
        accountCount: accountsByWallet.get(wallet.id) || 0,
      },
    };
  }).filter(Boolean);
}