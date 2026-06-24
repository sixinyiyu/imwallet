import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { config } from "../config";
import type { FeeMode } from "../config";
import { logger } from "../utils/logger";
import { escapeLikeWildcards } from "../utils/likeEscape";

/**
 * 从 app_configs 表动态读取费率配置，不存在则回退到 config 文件默认值。
 * 数据库中的记录优先于配置文件。
 */
async function getFeeConfig() {
  const [feeRateRecord, feeModeRecord] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "fee_rate" } }),
    prisma.appConfig.findUnique({ where: { key: "fee_mode" } }),
  ]);
  return {
    feeRate: feeRateRecord ? parseFloat(feeRateRecord.value) : config.fee.rate,
    feeMode: (feeModeRecord?.value as FeeMode) || config.fee.mode,
  };
}

export interface TransferInput {
  fromWalletId: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  memo?: string;
}

export interface TransactionResult {
  id: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  fee: string;
  receivedAmount: string;
  feeMode: string;
  status: string;
  memo: string | null;
  createdAt: Date;
  fromWallet: { alias: string; address: string };
  toWallet: { alias: string; address: string };
  fromContactName: string;
  toContactName: string;
}

/**
 * 根据链地址查找钱包（查 wallets_addresses → wallet_subscriptions）
 * 返回 { id, address } 或 null
 * 注意：服务端不再存储 alias，alias 由客户端本地维护
 */
async function findWalletByAddress(address: string): Promise<{ id: string; address: string } | null> {
  const walletAddress = await prisma.walletAddress.findFirst({
    where: { address },
  });
  if (walletAddress) {
    // 通过 subscription 查找 wallet
    const sub = await prisma.walletSubscription.findFirst({
      where: { address_id: walletAddress.id },
      select: { wallet_id: true },
    });
    if (sub) {
      return { id: sub.wallet_id, address: walletAddress.address };
    }
  }
  return null;
}

/**
 * 获取钱包在该网络下的所有链地址（通过 wallet_subscriptions → wallets_addresses.address）
 */
async function getWalletAddresses(walletId: string): Promise<string[]> {
  const subs = await prisma.walletSubscription.findMany({
    where: { wallet_id: walletId, address_id: { not: "" } },
    select: { address_id: true },
  });
  const addressIds = subs.map((s: any) => s.address_id);
  if (addressIds.length === 0) return [];
  const walletAddresses = await prisma.walletAddress.findMany({ where: { id: { in: addressIds } } });
  return walletAddresses.map((wa: any) => wa.address);
}

export async function transfer(
  input: TransferInput,
  deviceId: string
): Promise<TransactionResult> {
  const amount = input.amount;

  logger.info("TRANSFER", `转账请求开始: fromWallet=${input.fromWalletId}, toAddress=${input.toAddress}, amount=${amount}, tokenSymbol=${input.tokenSymbol}`);

  // 校验发送钱包属于当前设备
  const subscription = await prisma.walletSubscription.findFirst({
    where: { wallet_id: input.fromWalletId, device_id: deviceId },
  });
  if (!subscription) {
    logger.warn("TRANSFER", `转账失败: 钱包不属于当前设备 - fromWalletId=${input.fromWalletId}, deviceId=${deviceId.slice(0, 8)}...`);
    throw createError(403, "该钱包不属于当前设备，无法操作");
  }

  // 通过 tokenSymbol + network 查找资产（获取 assetId 用于余额操作）
  const asset = await prisma.asset.findFirst({
    where: { symbol: input.tokenSymbol, chain: input.network },
  });

  if (!asset) {
    logger.warn("TRANSFER", `转账失败: 资产不存在 - tokenSymbol=${input.tokenSymbol}, network=${input.network}`);
    throw createError(404, "代币类型不存在，请刷新后重试");
  }

  const fromWallet = await prisma.wallet.findUnique({
    where: { id: input.fromWalletId },
  });

  if (!fromWallet) {
    logger.warn("TRANSFER", `转账失败: 发送钱包不存在 - fromWalletId=${input.fromWalletId}`);
    throw createError(404, "发送钱包不存在，请刷新后重试");
  }

  // 通过 subscription 获取发送方在该网络上的地址
  const fromSubs = await prisma.walletSubscription.findMany({
    where: { wallet_id: input.fromWalletId, address_id: { not: "" } },
    select: { address_id: true },
  });
  const fromAddressIds = fromSubs.map((s: any) => s.address_id);
  const fromWalletAddress = await prisma.walletAddress.findFirst({
    where: { id: { in: fromAddressIds }, chain: input.network },
    orderBy: { createdAt: "asc" },
  });
  if (!fromWalletAddress) {
    throw createError(400, "该钱包在此网络下无地址", "ADDRESS_NOT_FOUND");
  }
  const fromAddress = fromWalletAddress.address;

  // 收款地址查找：通过地址查找系统内钱包
  let toWalletId: string = "";
  let toWalletAddress: string = input.toAddress;

  const toWalletInfo = await findWalletByAddress(input.toAddress);
  if (toWalletInfo) {
    toWalletId = toWalletInfo.id;
    toWalletAddress = toWalletInfo.address;
  }

  if (fromWallet.id === toWalletId) {
    logger.warn("TRANSFER", `转账失败: 不能向自己转账 - walletId=${fromWallet.id}`);
    throw createError(400, "不能向自己转账");
  }

  // 交易限制：开启后仅支持系统内账户地址进行转账
  const restrictConfig = await prisma.appConfig.findUnique({ where: { key: "tx_restrict_wallet" } });
  if (restrictConfig?.value === "true" && !toWalletId) {
    logger.warn("TRANSFER", `转账失败: 收款地址不在系统内 - toAddress=${input.toAddress}`);
    throw createError(400, "收款地址不在系统内，仅支持系统内账户地址转账", "RECIPIENT_NOT_IN_SYSTEM");
  }

  // Get sender's AssetsAddress balance for this asset (via address_id)
  let senderAccountAsset: any = null;
  senderAccountAsset = await prisma.assetsAddress.findUnique({
    where: {
      addressId_assetId: { addressId: fromWalletAddress.id, assetId: asset.id },
    },
  });

  if (!senderAccountAsset) {
    logger.warn("TRANSFER", `转账失败: 发送方无该资产余额 - fromWalletId=${input.fromWalletId}, tokenSymbol=${input.tokenSymbol}`);
    throw createError(400, "当前钱包无该代币余额，请先充值");
  }

  const amountNum = parseFloat(amount);
  const { feeRate, feeMode } = await getFeeConfig();
  const fee = (amountNum * feeRate).toFixed(8);
  const feeNum = parseFloat(fee);

  let senderDeduction: number;
  let recipientReceived: number;
  let requiredBalance: number;

  if (feeMode === "EXTRA") {
    senderDeduction = amountNum + feeNum;
    recipientReceived = amountNum;
    requiredBalance = amountNum + feeNum;
  } else {
    senderDeduction = amountNum;
    recipientReceived = amountNum - feeNum;
    requiredBalance = amountNum;
  }

  const currentBalance = parseFloat(senderAccountAsset.balance.toString());
  if (currentBalance < requiredBalance) {
    logger.warn("TRANSFER", `转账失败: 余额不足 - 当前余额=${currentBalance}, 需要=${requiredBalance}, fromWalletId=${input.fromWalletId}`);
    throw createError(400, "余额不足，请减少转账金额或先充值");
  }

  // Ensure recipient has an AssetsAddress entry for this asset (only for in-system recipients)
  let recipientAccountAssetId: string | null = null;
  if (toWalletId) {
    // 通过 subscription 获取收款方在该网络上的地址
    const toSubs = await prisma.walletSubscription.findMany({
      where: { wallet_id: toWalletId, address_id: { not: "" } },
      select: { address_id: true },
    });
    const toAddressIds = toSubs.map((s: any) => s.address_id);
    const recipientWalletAddress = await prisma.walletAddress.findFirst({
      where: { id: { in: toAddressIds }, chain: input.network },
      orderBy: { createdAt: "asc" },
    });

    if (recipientWalletAddress) {
      const recipientAsset = await prisma.assetsAddress.upsert({
        where: {
          addressId_assetId: { addressId: recipientWalletAddress.id, assetId: asset.id },
        },
        update: {},
        create: {
          addressId: recipientWalletAddress.id,
          assetId: asset.id,
          chain: input.network,
          balance: 0,
        },
      });
      recipientAccountAssetId = recipientAsset.id;
    }
  }

  const txHash =
    "0x" +
    createHash("sha256")
      .update(`${fromAddress}-${toWalletAddress}-${amount}-${Date.now()}-${uuid()}`)
      .digest("hex");

  const tx = await prisma.$transaction(async (tx: any) => {
    // Update sender AssetsAddress balance
    await tx.assetsAddress.update({
      where: { id: senderAccountAsset.id },
      data: { balance: { decrement: senderDeduction } },
    });

    // Update recipient AssetsAddress balance (only for in-system recipients)
    if (recipientAccountAssetId) {
      await tx.assetsAddress.update({
        where: { id: recipientAccountAssetId },
        data: { balance: { increment: recipientReceived } },
      });
    }

    return tx.transaction.create({
      data: {
        txHash,
        fromAddress,
        toAddress: toWalletAddress,
        tokenSymbol: input.tokenSymbol,
        amount,
        fee,
        status: "CONFIRMED",
        memo: input.memo || "",
      },
    });
  });

  logger.info("TRANSFER", `转账成功: txHash=${txHash}, from=${fromAddress}, to=${toWalletAddress}, amount=${amount}, fee=${fee}, received=${recipientReceived.toFixed(8)}, feeMode=${feeMode}`);

  // Create notifications linked to wallets (not devices)
  // 注意：服务端不再存储 alias，通知内容使用地址前缀代替
  const toName = toWalletAddress.slice(0, 10);
  const fromName = fromAddress.slice(0, 10);

  await prisma.notification.create({
    data: {
      wallet_id: fromWallet.id,
      title: "转账成功",
      content: `您已向 ${toName} 转出 ${amount} ${input.tokenSymbol}`,
      type: "TRANSFER_OUT",
    },
  });

  // Only notify in-system recipients
  if (toWalletId) {
    await prisma.notification.create({
      data: {
        wallet_id: toWalletId,
        title: "收到转账",
        content: `您收到来自 ${fromName} 的 ${recipientReceived.toFixed(8)} ${input.tokenSymbol}`,
        type: "TRANSFER_IN",
      },
    });
  }

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromAddress: tx.fromAddress,
    toAddress: tx.toAddress,
    tokenSymbol: tx.tokenSymbol,
    tokenName: asset.name,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    receivedAmount: recipientReceived.toFixed(8),
    feeMode: feeMode,
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
    fromWallet: { alias: "", address: fromAddress },
    toWallet: { alias: "", address: toWalletAddress },
    fromContactName: "",
    toContactName: "",
  };
}

export interface TransactionListFilter {
  walletId: string;
  page?: number;
  limit?: number;
  type?: "all" | "send" | "receive";
  timeRange?: "today" | "7d" | "30d" | "90d";
  search?: string;
  tokenSymbol?: string;
}

export async function getTransactions(
  filter: TransactionListFilter
): Promise<{ transactions: TransactionResult[]; total: number }> {
  const walletId = filter.walletId;
  const page = filter.page || 1;
  const limit = Math.min(filter.limit || 20, 100);

  // 获取钱包的所有链地址（wallets_addresses.address）
  const walletAddresses = await getWalletAddresses(walletId);

  // 按地址过滤交易
  const conditions: any[] = [
    { fromAddress: { in: walletAddresses } },
    { toAddress: { in: walletAddresses } },
  ];

  if (filter.type === "send") {
    conditions.length = 0;
    conditions.push({ fromAddress: { in: walletAddresses } });
  } else if (filter.type === "receive") {
    conditions.length = 0;
    conditions.push({ toAddress: { in: walletAddresses } });
  }

  const where: any = { OR: conditions };

  // 按代币符号直接过滤
  if (filter.tokenSymbol) {
    where.tokenSymbol = filter.tokenSymbol;
  }

  if (filter.timeRange) {
    const now = new Date();
    let startDate: Date;
    switch (filter.timeRange) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }
    where.createdAt = { gte: startDate };
  }

  // 联系人搜索已移除（contacts 在客户端），仅支持地址搜索
  if (filter.search && filter.search.trim()) {
    const keyword = escapeLikeWildcards(filter.search.trim());
    // 直接在 fromAddress / toAddress 上搜索
    where.OR = [
      ...where.OR,
      { fromAddress: { contains: keyword, mode: "insensitive" } },
      { toAddress: { contains: keyword, mode: "insensitive" } },
    ];
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  // Collect all unique addresses from transactions for wallet lookup
  const allAddresses = new Set<string>();
  for (const tx of transactions) {
    allAddresses.add(tx.fromAddress);
    if (tx.toAddress) allAddresses.add(tx.toAddress);
  }

  // Batch lookup wallets by address (wallets_addresses → wallet_subscriptions)
  const addressList = [...allAddresses];
  const walletAddressesByAddr = await prisma.walletAddress.findMany({
    where: { address: { in: addressList } },
    select: { id: true, address: true },
  });
  const waIds = walletAddressesByAddr.map((wa: any) => wa.id);
  const addrSubs = await prisma.walletSubscription.findMany({
    where: { address_id: { in: waIds } },
    select: { wallet_id: true, address_id: true },
  });

  // Build address → walletId map
  const waIdToAddress = new Map<string, string>();
  for (const wa of walletAddressesByAddr) {
    waIdToAddress.set(wa.id, wa.address);
  }
  const walletIdByAddressMap = new Map<string, string>();
  for (const sub of addrSubs) {
    const addr = waIdToAddress.get(sub.address_id);
    if (addr && !walletIdByAddressMap.has(addr)) {
      walletIdByAddressMap.set(addr, sub.wallet_id);
    }
  }

  // 查找 tokenName（tokenSymbol 已在交易表中，只需补充 name）
  const tokenSymbols = [...new Set(transactions.map((tx: any) => tx.tokenSymbol))];
  const tokenRecords = await prisma.asset.findMany({
    where: { symbol: { in: tokenSymbols } },
    select: { symbol: true, name: true },
  });
  const tokenNameMap = new Map<string, string>(tokenRecords.map((t: any) => [t.symbol, t.name]));

  const { feeMode } = await getFeeConfig();

  return {
    transactions: transactions.map((tx: any) => formatTransaction(tx, walletIdByAddressMap, tokenNameMap, feeMode)),
    total,
  };
}

export async function getTransactionDetail(
  txId: string
): Promise<TransactionResult> {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
  });

  if (!tx) {
    throw createError(404, "交易记录不存在");
  }

  // Look up wallets by address (wallets_addresses → wallet_subscriptions)
  const addressList: string[] = [tx.fromAddress];
  if (tx.toAddress) addressList.push(tx.toAddress);

  const walletAddressesByAddr = await prisma.walletAddress.findMany({
    where: { address: { in: addressList } },
    select: { id: true, address: true },
  });
  const waIds = walletAddressesByAddr.map((wa: any) => wa.id);
  const addrSubs = await prisma.walletSubscription.findMany({
    where: { address_id: { in: waIds } },
    select: { wallet_id: true, address_id: true },
  });

  const waIdToAddress = new Map<string, string>();
  for (const wa of walletAddressesByAddr) {
    waIdToAddress.set(wa.id, wa.address);
  }
  const walletIdByAddressMap = new Map<string, string>();
  for (const sub of addrSubs) {
    const addr = waIdToAddress.get(sub.address_id);
    if (addr && !walletIdByAddressMap.has(addr)) {
      walletIdByAddressMap.set(addr, sub.wallet_id);
    }
  }

  // 查找 tokenName
  const tokenRecord = await prisma.asset.findFirst({
    where: { symbol: tx.tokenSymbol },
    select: { name: true },
  });
  const tokenNameMap = new Map(tokenRecord ? [[tx.tokenSymbol, tokenRecord.name]] : []);

  const { feeMode } = await getFeeConfig();

  return formatTransaction(tx, walletIdByAddressMap, tokenNameMap, feeMode);
}

function formatTransaction(
  tx: any,
  walletIdByAddressMap: Map<string, string>,
  tokenNameMap: Map<string, string>,
  feeMode: FeeMode
): TransactionResult {
  const amountNum = parseFloat(tx.amount.toString());
  const feeNum = parseFloat(tx.fee.toString());

  let receivedAmount: string;
  if (feeMode === "EXTRA") {
    receivedAmount = amountNum.toFixed(8);
  } else {
    receivedAmount = (amountNum - feeNum).toFixed(8);
  }

  // 服务端不再存储 alias，fromWallet/toWallet 的 alias 为空，由客户端补充
  const fromWalletInfo = { alias: "", address: tx.fromAddress };
  const toWalletInfo = { alias: "", address: tx.toAddress || "" };

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromAddress: tx.fromAddress,
    toAddress: tx.toAddress,
    tokenSymbol: tx.tokenSymbol,
    tokenName: tokenNameMap.get(tx.tokenSymbol) || "",
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    receivedAmount,
    feeMode: feeMode,
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
    fromWallet: fromWalletInfo,
    toWallet: toWalletInfo,
    fromContactName: "",
    toContactName: "",
  };
}