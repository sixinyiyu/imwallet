import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { config } from "../config";
import type { FeeMode } from "../config";
import * as notificationService from "./notificationService";

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
  fromUsername: string;
  toUsername: string;
  fromContactName: string;
  toContactName: string;
  tokenSymbol: string;
  tokenName: string;
}

export interface TransactionListQuery {
  walletId: string;
  page?: number;
  limit?: number;
}

async function resolveUsername(walletId: string): Promise<string> {
  const userWallet = await prisma.userWallet.findFirst({
    where: { walletId },
    include: {
      user: {
        select: { username: true, status: true },
      },
    },
  });
  return userWallet?.user?.username || "";
}

export async function transfer(
  input: TransferInput
): Promise<TransactionResult> {
  const amount = input.amount;

  // Validate token exists
  const token = await prisma.token.findUnique({
    where: { id: input.tokenId },
  });

  if (!token) {
    throw createError(404, "Token not found");
  }

  const toWallet = await prisma.wallet.findUnique({
    where: { address: input.toAddress },
  });

  if (!toWallet) {
    throw createError(404, "Recipient wallet not found");
  }

  const fromWallet = await prisma.wallet.findUnique({
    where: { id: input.fromWalletId },
  });

  if (!fromWallet) {
    throw createError(404, "Sender wallet not found");
  }

  if (fromWallet.id === toWallet.id) {
    throw createError(400, "Cannot transfer to the same wallet");
  }

  // Get sender's WalletToken balance for this token
  const senderWalletToken = await prisma.walletToken.findUnique({
    where: {
      walletId_tokenId: { walletId: input.fromWalletId, tokenId: input.tokenId },
    },
  });

  if (!senderWalletToken) {
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

  if (parseFloat(senderWalletToken.balance.toString()) < requiredBalance) {
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

  const tx = await prisma.$transaction(async (tx) => {
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

  const [fromUsername, toUsername] = await Promise.all([
    resolveUsername(tx.fromWalletId),
    resolveUsername(tx.toWalletId),
  ]);

  // Send notifications
  const [fromUserWallets, toUserWallets] = await Promise.all([
    prisma.userWallet.findMany({ where: { walletId: tx.fromWalletId }, select: { userId: true } }),
    prisma.userWallet.findMany({ where: { walletId: tx.toWalletId }, select: { userId: true } }),
  ]);

  const toName = toUsername || tx.toWallet.address.slice(0, 10);
  const fromName = fromUsername || tx.fromWallet.address.slice(0, 10);
  const tokenSymbol = token.symbol;

  for (const uw of fromUserWallets) {
    await notificationService.createNotification(
      uw.userId,
      "转账成功",
      `您已向 ${toName} 转出 ${amount} ${tokenSymbol}`,
      "TRANSFER_OUT"
    );
  }
  for (const uw of toUserWallets) {
    await notificationService.createNotification(
      uw.userId,
      "收到转账",
      `您收到来自 ${fromName} 的 ${recipientReceived.toFixed(8)} ${tokenSymbol}`,
      "TRANSFER_IN"
    );
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
    fromUsername,
    toUsername,
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
    const matchingUsers = await prisma.user.findMany({
      where: { username: { contains: keyword, mode: "insensitive" } },
      include: { wallets: { select: { walletId: true } } },
    });
    const userWalletIds = matchingUsers.flatMap((u) => u.wallets.map((w) => w.walletId));
    const walletIds = [...matchingWallets.map((w) => w.id), ...userWalletIds];
    const contactAddresses = matchingContacts.map((c) => c.address);
    const typeConditions = filter.type === "send" ? [{ fromWalletId: walletId }] : filter.type === "receive" ? [{ toWalletId: walletId }] : [{ fromWalletId: walletId }, { toWalletId: walletId }];
    where.OR = typeConditions.map((cond) => ({
      ...cond,
      OR: [
        { fromWalletId: { in: walletIds } },
        { toWalletId: { in: walletIds } },
      ],
    }));
    const extraConditions = contactAddresses.map((addr) => {
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
  const walletIds = new Set<string>();
  for (const tx of transactions) {
    addresses.add(tx.fromWallet.address);
    addresses.add(tx.toWallet.address);
    walletIds.add(tx.fromWalletId);
    walletIds.add(tx.toWalletId);
  }

  const [contacts, userWallets] = await Promise.all([
    prisma.contact.findMany({
      where: { address: { in: [...addresses] } },
      select: { address: true, name: true },
    }),
    prisma.userWallet.findMany({
      where: { walletId: { in: [...walletIds] } },
      include: { user: { select: { username: true } } },
    }),
  ]);

  const contactMap = new Map(contacts.map((c) => [c.address, c.name]));
  const usernameMap = new Map<string, string>();
  for (const uw of userWallets) {
    if (!usernameMap.has(uw.walletId)) {
      usernameMap.set(uw.walletId, uw.user.username);
    }
  }

  return {
    transactions: transactions.map((tx) => formatTransaction(tx, contactMap, usernameMap)),
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
  const walletIds = [tx.fromWalletId, tx.toWalletId];

  const [contacts, userWallets] = await Promise.all([
    prisma.contact.findMany({
      where: { address: { in: addresses } },
      select: { address: true, name: true },
    }),
    prisma.userWallet.findMany({
      where: { walletId: { in: walletIds } },
      include: { user: { select: { username: true } } },
    }),
  ]);

  const contactMap = new Map(contacts.map((c) => [c.address, c.name]));
  const usernameMap = new Map<string, string>();
  for (const uw of userWallets) {
    if (!usernameMap.has(uw.walletId)) {
      usernameMap.set(uw.walletId, uw.user.username);
    }
  }

  return formatTransaction(tx, contactMap, usernameMap);
}

function formatTransaction(
  tx: any,
  contactMap?: Map<string, string>,
  usernameMap?: Map<string, string>
): TransactionResult {
  const cMap = contactMap || new Map<string, string>();
  const uMap = usernameMap || new Map<string, string>();
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
    fromUsername: uMap.get(tx.fromWalletId) || "",
    toUsername: uMap.get(tx.toWalletId) || "",
    fromContactName: cMap.get(tx.fromWallet.address) || "",
    toContactName: cMap.get(tx.toWallet.address) || "",
    tokenSymbol: tx.token?.symbol || "",
    tokenName: tx.token?.name || "",
  };
}
