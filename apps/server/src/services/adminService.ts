import prisma from "../config/prisma";
import { logger } from "../utils/logger";

/** 获取所有设备列表 */
export async function getAllDevices() {
  const devices = await prisma.device.findMany({
    orderBy: { created_at: "desc" },
  });

  return devices.map((d: any) => ({
    id: d.id,
    device_id: d.device_id,
    platform: d.platform,
    platform_store: d.platform_store,
    os: d.os,
    model: d.model,
    locale: d.locale,
    version: d.version,
    currency: d.currency,
    is_push_enabled: d.is_push_enabled,
    is_price_alerts_enabled: d.is_price_alerts_enabled,
    subscriptions_version: d.subscriptions_version,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));
}

/** 获取所有钱包列表（含关联设备数） */
export async function getAllWallets() {
  const wallets = await prisma.wallet.findMany({
    include: {
      subscriptions: {
        include: {
          device: {
            select: { device_id: true, platform: true, model: true },
          },
        },
      },
      tokenBalances: {
        include: { token: { select: { symbol: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return wallets.map((w: any) => ({
    id: w.id,
    identifier: w.identifier,
    alias: w.alias,
    address: w.address,
    source: w.source,
    isBackedUp: w.isBackedUp,
    memo: w.memo,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    deviceCount: w.subscriptions.length,
    devices: w.subscriptions.map((s: any) => ({
      device_id: s.device.device_id,
      platform: s.device.platform,
      model: s.device.model,
    })),
    tokenBalances: w.tokenBalances.map((tb: any) => ({
      symbol: tb.token.symbol,
      name: tb.token.name,
      balance: tb.balance.toString(),
    })),
  }));
}

/** 获取所有钱包-设备订阅关系 */
export async function getAllSubscriptions() {
  const subs = await prisma.walletSubscription.findMany({
    include: {
      wallet: { select: { identifier: true, alias: true } },
      device: { select: { device_id: true, platform: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return subs.map((s: any) => ({
    id: s.id,
    wallet_id: s.wallet_id,
    wallet_identifier: s.wallet.identifier,
    wallet_alias: s.wallet.alias,
    device_id: s.device_id,
    device_public_key: s.device.device_id,
    device_platform: s.device.platform,
    chain: s.chain,
    address_id: s.address_id,
    created_at: s.created_at,
  }));
}

/** 获取所有交易记录 */
export async function getAllTransactions() {
  const txs = await prisma.transaction.findMany({
    include: {
      fromWallet: { select: { identifier: true, alias: true, address: true } },
      toWallet: { select: { identifier: true, alias: true, address: true } },
      token: { select: { symbol: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return txs.map((tx: any) => ({
    id: tx.id,
    txHash: tx.txHash,
    fromWallet: {
      id: tx.fromWalletId,
      identifier: tx.fromWallet.identifier,
      alias: tx.fromWallet.alias,
      address: tx.fromWallet.address,
    },
    toWallet: {
      id: tx.toWalletId,
      identifier: tx.toWallet.identifier,
      alias: tx.toWallet.alias,
      address: tx.toWallet.address,
    },
    token: {
      id: tx.tokenId,
      symbol: tx.token.symbol,
      name: tx.token.name,
    },
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
  }));
}
