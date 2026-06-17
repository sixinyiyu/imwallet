import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { config } from "../config";
import type { FeeMode } from "../config";
import { logger } from "../utils/logger";

const FEE_RATE = config.fee.rate;
const FEE_MODE: FeeMode = config.fee.mode;

export interface TransferInput {
  fromWalletId: string;
  toAddress: string;
  amount: string;
  tokenId: string;
  memo?: string;
}

export interface TransactionResult {
  id: string;
  txHash: string;
  fromWalletId: string;
  toWalletId: string;
  tokenId: string;
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
  tokenSymbol: string;
  tokenName: string;
}

export async function transfer(
  input: TransferInput,
  deviceId: string
): Promise<TransactionResult> {
  const amount = input.amount;

  logger.info("TRANSFER", `转账请求开始: fromWallet=${input.fromWalletId}, toAddress=${input.toAddress}, amount=${amount}, tokenId=${input.tokenId}`);

  // 校验发送钱包属于当前设备
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "Device not found", "DEVICE_NOT_FOUND");
  }

  const subscription = await prisma.walletSubscription.findFirst({
    where: { wallet_id: input.fromWalletId, device_id: device.id },
  });
  if (!subscription) {
    logger.warn("TRANSFER", `转账失败: 钱包不属于当前设备 - fromWalletId=${input.fromWalletId}, deviceId=${deviceId.slice(0, 8)}...`);
    throw createError(403, "Wallet does not belong to this device");
  }

  // Validate token exists
  const token = await prisma.token.findUnique({
    where: { id: input.tokenId },
  });

  if (!token) {
    logger.warn("TRANSFER", `转账失败: 代币不存在 - tokenId=${input.tokenId}`);
    throw createError(404, "Token not found");
  }

  const toWallet = await prisma.wallet.findUnique({
    where: { address: input.toAddress },
  });

  if (!toWallet) {
    logger.warn("TRANSFER", `转账失败: 收款钱包不存在 - toAddress=${input.toAddress}`);
    throw createError(404, "Recipient wallet not found");
  }

  const fromWallet = await prisma.wallet.findUnique({
    where: { id: input.fromWalletId },
  });

  if (!fromWallet) {
    logger.warn("TRANSFER", `转账失败: 发送钱包不存在 - fromWalletId=${input.fromWalletId}`);
    throw createError(404, "Sender wallet not found");
  }

  if (fromWallet.id === toWallet.id) {
    logger.warn("TRANSFER", `转账失败: 不能向自己转账 - walletId=${fromWallet.id}`);
    throw createError(400, "Cannot transfer to the same wallet");
  }

  // Get sender's WalletToken balance for this token
  const senderWalletToken = await prisma.walletToken.findUnique({
    where: {
      walletId_tokenId: { walletId: input.fromWalletId, tokenId: input.tokenId },
    },
  });

  if (!senderWalletToken) {
    logger.warn("TRANSFER", `转账失败: 发送方无该代币余额 - fromWalletId=${input.fromWalletId}, tokenId=${input.tokenId}`);
    throw createError(400, "No balance found for this token in sender wallet");
  }

  const amountNum = parseFloat(amount);
  const fee = (amountNum * FEE_RATE).toFixed(8);
  const feeNum = parseFloat(fee);

  let senderDeduction: number;
  let recipientReceived: number;
  let requiredBalance: number;

  if (FEE_MODE === "EXTRA") {
    senderDeduction = amountNum + feeNum;
    recipientReceived = amountNum;
    requiredBalance = amountNum + feeNum;
  } else {
    senderDeduction = amountNum;
    recipientReceived = amountNum - feeNum;
    requiredBalance = amountNum;
  }

  const currentBalance = parseFloat(senderWalletToken.balance.toString());
  if (currentBalance < requiredBalance) {
    logger.warn("TRANSFER", `转账失败: 余额不足 - 当前余额=${currentBalance}, 需要=${requiredBalance}, fromWalletId=${input.fromWalletId}`);
    throw createError(400, "Insufficient balance");
  }

  // Ensure recipient has a WalletToken entry for this token
  const recipientWalletToken = await prisma.walletToken.upsert({
    where: {
      walletId_tokenId: { walletId: toWallet.id, tokenId: input.tokenId },
    },
    update: {},
    create: {
      walletId: toWallet.id,
      tokenId: input.tokenId,
      balance: 0,
    },
  });

  const txHash =
    "0x" +
    createHash("sha256")
      .update(`${input.fromWalletId}-${toWallet.id}-${amount}-${Date.now()}-${uuid()}`)
      .digest("hex");

  const tx = await prisma.$transaction(async (tx: any) => {
    // Update sender WalletToken balance
    await tx.walletToken.update({
      where: { id: senderWalletToken.id },
      data: { balance: { decrement: senderDeduction } },
    });

    // Update recipient WalletToken balance
    await tx.walletToken.update({
      where: { id: recipientWalletToken.id },
      data: { balance: { increment: recipientReceived } },
    });

    return tx.transaction.create({
      data: {
        txHash,
        fromWalletId: input.fromWalletId,
        toWalletId: toWallet.id,
        tokenId: input.tokenId,
        amount,
        fee,
        status: "CONFIRMED",
        memo: input.memo || "",
      },
      include: {
        fromWallet: { select: { alias: true, address: true } },
        toWallet: { select: { alias: true, address: true } },
        token: { select: { symbol: true, name: true } },
      },
    });
  });

  logger.info("TRANSFER", `转账成功: txHash=${txHash}, from=${input.fromWalletId}, to=${toWallet.id}, amount=${amount}, fee=${fee}, received=${recipientReceived.toFixed(8)}, feeMode=${FEE_MODE}`);

  // Send notifications to devices that subscribe the involved wallets
  const [fromDeviceSubs, toDeviceSubs] = await Promise.all([
    prisma.walletSubscription.findMany({
      where: { wallet_id: tx.fromWalletId },
      select: { device_id: true },
    }),
    prisma.walletSubscription.findMany({
      where: { wallet_id: tx.toWalletId },
      select: { device_id: true },
    }),
  ]);

  const toName = tx.toWallet.alias || tx.toWallet.address.slice(0, 10);
  const fromName = tx.fromWallet.alias || tx.fromWallet.address.slice(0, 10);
  const tokenSymbol = token.symbol;

  for (const sub of fromDeviceSubs) {
    await prisma.notification.create({
      data: {
        device_id: sub.device_id,
        title: "转账成功",
        content: `您已向 ${toName} 转出 ${amount} ${tokenSymbol}`,
        type: "TRANSFER_OUT",
      },
    });
  }

  for (const sub of toDeviceSubs) {
    await prisma.notification.create({
      data: {
        device_id: sub.device_id,
        title: "收到转账",
        content: `您收到来自 ${fromName} 的 ${recipientReceived.toFixed(8)} ${tokenSymbol}`,
        type: "TRANSFER_IN",
      },
    });
  }

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromWalletId: tx.fromWalletId,
    toWalletId: tx.toWalletId,
    tokenId: tx.tokenId,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    receivedAmount: recipientReceived.toFixed(8),
    feeMode: FEE_MODE,
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
    fromWallet: tx.fromWallet,
    toWallet: tx.toWallet,
    fromContactName: "",
    toContactName: "",
    tokenSymbol: token.symbol,
    tokenName: token.name,
  };
}

export interface TransactionListFilter {
  walletId: string;
  page?: number;
  limit?: number;
  type?: "all" | "send" | "receive";
  timeRange?: "today" | "7d" | "30d" | "90d";
  search?: string;
}

export async function getTransactions(
  filter: TransactionListFilter
): Promise<{ transactions: TransactionResult[]; total: number }> {
  const walletId = filter.walletId;
  const page = filter.page || 1;
  const limit = Math.min(filter.limit || 20, 100);

  const conditions: any[] = [{ fromWalletId: walletId }, { toWalletId: walletId }];

  if (filter.type === "send") {
    conditions.length = 0;
    conditions.push({ fromWalletId: walletId });
  } else if (filter.type === "receive") {
    conditions.length = 0;
    conditions.push({ toWalletId: walletId });
  }

  const where: any = { OR: conditions };

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

  if (filter.search && filter.search.trim()) {
    const keyword = filter.search.trim();
    const matchingWallets = await prisma.wallet.findMany({
      where: {
        OR: [
          { address: { contains: keyword, mode: "insensitive" } },
          { alias: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { address: { contains: keyword, mode: "insensitive" } },
          { name: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: { address: true },
    });
    const walletIds = matchingWallets.map((w: any) => w.id);
    const contactAddresses = matchingContacts.map((c: any) => c.address);

    const typeConditions = filter.type === "send" ? [{ fromWalletId: walletId }] : filter.type === "receive" ? [{ toWalletId: walletId }] : [{ fromWalletId: walletId }, { toWalletId: walletId }];
    where.OR = typeConditions.map((cond) => ({
      ...cond,
      OR: [
        { fromWalletId: { in: walletIds } },
        { toWalletId: { in: walletIds } },
      ],
    }));
    const extraConditions = contactAddresses.map((addr: any) => {
      if (filter.type === "send") return { fromWalletId: walletId, toWallet: { address: addr } };
      if (filter.type === "receive") return { toWalletId: walletId, fromWallet: { address: addr } };
      return { OR: [{ fromWalletId: walletId, toWallet: { address: addr } }, { toWalletId: walletId, fromWallet: { address: addr } }] };
    });
    if (extraConditions.length > 0) {
      where.OR = [...where.OR, ...extraConditions];
    }
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        fromWallet: { select: { alias: true, address: true } },
        toWallet: { select: { alias: true, address: true } },
        token: { select: { symbol: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  const addresses = new Set<string>();
  for (const tx of transactions) {
    addresses.add(tx.fromWallet.address);
    addresses.add(tx.toWallet.address);
  }

  const contacts = await prisma.contact.findMany({
    where: { address: { in: [...addresses] } },
    select: { address: true, name: true },
  });

  const contactMap = new Map<string, string>(contacts.map((c: any) => [c.address, c.name]));

  return {
    transactions: transactions.map((tx: any) => formatTransaction(tx, contactMap)),
    total,
  };
}

export async function getTransactionDetail(
  txId: string
): Promise<TransactionResult> {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    include: {
      fromWallet: { select: { alias: true, address: true } },
      toWallet: { select: { alias: true, address: true } },
      token: { select: { symbol: true, name: true } },
    },
  });

  if (!tx) {
    throw createError(404, "Transaction not found");
  }

  const addresses = [tx.fromWallet.address, tx.toWallet.address];

  const contacts = await prisma.contact.findMany({
    where: { address: { in: addresses } },
    select: { address: true, name: true },
  });

  const contactMap = new Map<string, string>(contacts.map((c: any) => [c.address, c.name]));

  return formatTransaction(tx, contactMap);
}

function formatTransaction(
  tx: any,
  contactMap?: Map<string, string>
): TransactionResult {
  const cMap = contactMap || new Map<string, string>();
  const amountNum = parseFloat(tx.amount.toString());
  const feeNum = parseFloat(tx.fee.toString());

  let receivedAmount: string;
  if (FEE_MODE === "EXTRA") {
    receivedAmount = amountNum.toFixed(8);
  } else {
    receivedAmount = (amountNum - feeNum).toFixed(8);
  }

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromWalletId: tx.fromWalletId,
    toWalletId: tx.toWalletId,
    tokenId: tx.tokenId,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    receivedAmount,
    feeMode: FEE_MODE,
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
    fromWallet: tx.fromWallet,
    toWallet: tx.toWallet,
    fromContactName: cMap.get(tx.fromWallet.address) || "",
    toContactName: cMap.get(tx.toWallet.address) || "",
    tokenSymbol: tx.token?.symbol || "",
    tokenName: tx.token?.name || "",
  };
}
