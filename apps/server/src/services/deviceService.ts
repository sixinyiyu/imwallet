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
  platform_store: string | null;
  os: string | null;
  model: string | null;
  locale: string | null;
  version: string | null;
  currency: string | null;
  token: string | null;
  is_push_enabled: boolean;
  is_price_alerts_enabled: boolean;
  subscriptions_version: number | null;
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
      platform_store: existing.platform_store as string | null,
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
      platform_store: input.platform_store as any || null,
      os: input.os || null,
      model: input.model || null,
      locale: input.locale || null,
      version: input.version || null,
      currency: input.currency || null,
    },
  });

  logger.info("DEVICE", `注册设备成功: id=${device.id}, device_id=${device.device_id.slice(0, 8)}...`);

  return {
    id: device.id,
    device_id: device.device_id,
    platform: device.platform as string,
    platform_store: device.platform_store as string | null,
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
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
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
    platform_store: updated.platform_store as string | null,
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
    platform_store: device.platform_store as string | null,
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
): Promise<{ id: number; wallet_id: string; device_id: number; chain: string | null; address_id: string | null }> {
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
    throw createError(404, "Wallet not found", "WALLET_NOT_FOUND");
  }

  // 检查是否已订阅
  const existing = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: walletId,
      device_id: device.id,
      chain: chain || null,
      address_id: addressId || null,
    },
  });

  if (existing) {
    throw createError(409, "Already subscribed", "ALREADY_SUBSCRIBED");
  }

  const subscription = await prisma.walletSubscription.create({
    data: {
      wallet_id: walletId,
      device_id: device.id,
      chain: chain || null,
      address_id: addressId || null,
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
    throw createError(404, "Subscription not found", "SUBSCRIPTION_NOT_FOUND");
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

  // Fetch wallets, walletTokens, tokens, and accounts separately
  const wallets = await prisma.wallet.findMany({ where: { id: { in: walletIds } } });
  const walletMap = new Map(wallets.map((w: any) => [w.id, w]));

  const walletTokens = await prisma.walletToken.findMany({ where: { walletId: { in: walletIds } } });
  const tokenIds = [...new Set(walletTokens.map((wt: any) => wt.tokenId))];
  const tokens = await prisma.token.findMany({ where: { id: { in: tokenIds } } });
  const tokenMap = new Map(tokens.map((t: any) => [t.id, t]));

  // Group walletTokens by walletId
  const walletTokensByWallet = new Map<string, any[]>();
  for (const wt of walletTokens) {
    const list = walletTokensByWallet.get(wt.walletId) || [];
    list.push(wt);
    walletTokensByWallet.set(wt.walletId, list);
  }

  const accounts = await prisma.account.findMany({ where: { walletId: { in: walletIds } } });
  const accountsByWallet = new Map<string, number>();
  for (const acc of accounts) {
    accountsByWallet.set(acc.walletId, (accountsByWallet.get(acc.walletId) || 0) + 1);
  }

  return subscriptions.map((sub: any) => {
    const wallet = walletMap.get(sub.wallet_id);
    if (!wallet) return null;
    const wts = walletTokensByWallet.get(wallet.id) || [];
    return {
      subscription_id: sub.id,
      chain: sub.chain,
      address_id: sub.address_id,
      wallet: {
        id: wallet.id,
        identifier: wallet.identifier,
        alias: wallet.alias,
        address: wallet.address,
        source: wallet.source,
        memo: wallet.memo,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        tokenBalances: wts.map((tb: any) => {
          const tk = tokenMap.get(tb.tokenId);
          return {
            id: tb.id,
            symbol: tk?.symbol || "",
            name: tk?.name || "",
            balance: tb.balance.toString(),
            decimals: tk?.decimals || 6,
            network: tk?.network || "",
          };
        }),
        accountCount: accountsByWallet.get(wallet.id) || 0,
      },
    };
  }).filter(Boolean);
}