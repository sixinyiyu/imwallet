import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { config } from "../config";
import type { FeeMode } from "../config";
import { logger } from "../utils/logger";

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
  fromWalletId: string;
  fromAddress: string;
  toWalletId: string;
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

export async function transfer(
  input: TransferInput,
  deviceId: string
): Promise<TransactionResult> {
  const amount = input.amount;

  logger.info("TRANSFER", `转账请求开始: fromWallet=${input.fromWalletId}, toAddress=${input.toAddress}, amount=${amount}, tokenSymbol=${input.tokenSymbol}`);

  // 校验发送钱包属于当前设备
  const device = await prisma.device.findUnique({
    where: { device_id: deviceId },
  });
  if (!device) {
    throw createError(404, "设备未注册，请重新登录", "DEVICE_NOT_FOUND");
  }

  const subscription = await prisma.walletSubscription.findFirst({
    where: { wallet_id: input.fromWalletId, device_id: device.id },
  });
  if (!subscription) {
    logger.warn("TRANSFER", `转账失败: 钱包不属于当前设备 - fromWalletId=${input.fromWalletId}, deviceId=${deviceId.slice(0, 8)}...`);
    throw createError(403, "该钱包不属于当前设备，无法操作");
  }

  // 通过 tokenSymbol + network 查找代币（获取 tokenId 用于余额操作）
  const token = await prisma.token.findFirst({
    where: { symbol: input.tokenSymbol, network: input.network },
  });

  if (!token) {
    logger.warn("TRANSFER", `转账失败: 代币不存在 - tokenSymbol=${input.tokenSymbol}`);
    throw createError(404, "代币类型不存在，请刷新后重试");
  }

  const fromWallet = await prisma.wallet.findUnique({
    where: { id: input.fromWalletId },
  });

  if (!fromWallet) {
    logger.warn("TRANSFER", `转账失败: 发送钱包不存在 - fromWalletId=${input.fromWalletId}`);
    throw createError(404, "发送钱包不存在，请刷新后重试");
  }

  // 查找发送方在该网络上对应代币的 Account 链地址（取 index 最小的）
  const fromAccount = await prisma.account.findFirst({
    where: { walletId: input.fromWalletId, network: token.network, tokenSymbol: input.tokenSymbol },
    orderBy: { index: "asc" },
  });
  const fromAddress = fromAccount?.address || fromWallet.address;

  // 收款地址查找：先查 wallets 表（EVM 地址 0x...），再查 accounts 表（TRX 地址 T... 等）
  let toWalletId: string = "";
  let toWalletAddress: string = input.toAddress;
  let toWalletAlias: string = input.toAddress.slice(0, 10);

  const toWalletByAddress = await prisma.wallet.findUnique({
    where: { address: input.toAddress },
  });

  if (toWalletByAddress) {
    toWalletId = toWalletByAddress.id;
    toWalletAddress = toWalletByAddress.address;
    toWalletAlias = toWalletByAddress.alias || toWalletAddress.slice(0, 10);
  } else {
    const account = await prisma.account.findFirst({
      where: { address: input.toAddress },
    });
    if (account) {
      const accountWallet = await prisma.wallet.findUnique({
        where: { id: account.walletId },
      });
      if (accountWallet) {
        toWalletId = accountWallet.id;
        toWalletAddress = accountWallet.address;
        toWalletAlias = accountWallet.alias || accountWallet.address.slice(0, 10);
      }
    }
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

  // Get sender's WalletToken balance for this token (内部仍用 tokenId)
  const senderWalletToken = await prisma.walletToken.findUnique({
    where: {
      walletId_tokenId: { walletId: input.fromWalletId, tokenId: token.id },
    },
  });

  if (!senderWalletToken) {
    logger.warn("TRANSFER", `转账失败: 发送方无该代币余额 - fromWalletId=${input.fromWalletId}, tokenSymbol=${input.tokenSymbol}`);
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

  const currentBalance = parseFloat(senderWalletToken.balance.toString());
  if (currentBalance < requiredBalance) {
    logger.warn("TRANSFER", `转账失败: 余额不足 - 当前余额=${currentBalance}, 需要=${requiredBalance}, fromWalletId=${input.fromWalletId}`);
    throw createError(400, "余额不足，请减少转账金额或先充值");
  }

  // Ensure recipient has a WalletToken entry for this token (only for in-system recipients)
  let recipientWalletTokenId: string | null = null;
  if (toWalletId) {
    const recipientWalletToken = await prisma.walletToken.upsert({
      where: {
        walletId_tokenId: { walletId: toWalletId, tokenId: token.id },
      },
      update: {},
      create: {
        walletId: toWalletId,
        tokenId: token.id,
        balance: 0,
      },
    });
    recipientWalletTokenId = recipientWalletToken.id;
  }

  const txHash =
    "0x" +
    createHash("sha256")
      .update(`${input.fromWalletId}-${toWalletId || toWalletAddress}-${amount}-${Date.now()}-${uuid()}`)
      .digest("hex");

  const tx = await prisma.$transaction(async (tx: any) => {
    // Update sender WalletToken balance
    await tx.walletToken.update({
      where: { id: senderWalletToken.id },
      data: { balance: { decrement: senderDeduction } },
    });

    // Update recipient WalletToken balance (only for in-system recipients)
    if (recipientWalletTokenId) {
      await tx.walletToken.update({
        where: { id: recipientWalletTokenId },
        data: { balance: { increment: recipientReceived } },
      });
    }

    return tx.transaction.create({
      data: {
        txHash,
        fromWalletId: input.fromWalletId,
        fromAddress,
        toWalletId: toWalletId || "",
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
  const toName = toWalletAlias;
  const fromName = fromWallet.alias || fromAddress.slice(0, 10);

  await prisma.notification.create({
    data: {
      wallet_id: tx.fromWalletId,
      title: "转账成功",
      content: `您已向 ${toName} 转出 ${amount} ${input.tokenSymbol}`,
      type: "TRANSFER_OUT",
    },
  });

  // Only notify in-system recipients
  if (tx.toWalletId) {
    await prisma.notification.create({
      data: {
        wallet_id: tx.toWalletId,
        title: "收到转账",
        content: `您收到来自 ${fromName} 的 ${recipientReceived.toFixed(8)} ${input.tokenSymbol}`,
        type: "TRANSFER_IN",
      },
    });
  }

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromWalletId: tx.fromWalletId,
    fromAddress: tx.fromAddress,
    toWalletId: tx.toWalletId || "",
    toAddress: tx.toAddress,
    tokenSymbol: tx.tokenSymbol,
    tokenName: token.name,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    receivedAmount: recipientReceived.toFixed(8),
    feeMode: feeMode,
    status: tx.status,
    memo: tx.memo,
    createdAt: tx.createdAt,
    fromWallet: { alias: fromWallet.alias, address: fromWallet.address },
    toWallet: { alias: toWalletAlias, address: toWalletAddress },
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

  const conditions: any[] = [{ fromWalletId: walletId }, { toWalletId: walletId }];

  if (filter.type === "send") {
    conditions.length = 0;
    conditions.push({ fromWalletId: walletId });
  } else if (filter.type === "receive") {
    conditions.length = 0;
    conditions.push({ toWalletId: walletId });
  }

  const where: any = { OR: conditions };

  // 按代币符号直接过滤（tokenSymbol 已存储在交易表中）
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

    // Build search conditions without relation filters
    const typeConditions = filter.type === "send" ? [{ fromWalletId: walletId }] : filter.type === "receive" ? [{ toWalletId: walletId }] : [{ fromWalletId: walletId }, { toWalletId: walletId }];
    where.OR = typeConditions.map((cond) => ({
      ...cond,
      OR: [
        { fromWalletId: { in: walletIds } },
        { toWalletId: { in: walletIds } },
      ],
    }));

    // For contact address search, use fromAddress / toAddress fields directly
    if (contactAddresses.length > 0) {
      const addressConditions: any[] = [];
      if (filter.type === "send") {
        addressConditions.push({ fromWalletId: walletId, toAddress: { in: contactAddresses } });
      } else if (filter.type === "receive") {
        addressConditions.push({ toWalletId: walletId, fromAddress: { in: contactAddresses } });
      } else {
        addressConditions.push(
          { fromWalletId: walletId, toAddress: { in: contactAddresses } },
          { toWalletId: walletId, fromAddress: { in: contactAddresses } }
        );
      }
      where.OR = [...where.OR, ...addressConditions];
    }
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

  // Manually fetch related wallets (for alias info)
  const fromWalletIds = [...new Set(transactions.map((tx: any) => tx.fromWalletId))];
  const toWalletIds = [...new Set(transactions.filter((tx: any) => tx.toWalletId).map((tx: any) => tx.toWalletId))];

  const [fromWallets, toWallets] = await Promise.all([
    prisma.wallet.findMany({ where: { id: { in: fromWalletIds } }, select: { id: true, alias: true, address: true } }),
    prisma.wallet.findMany({ where: { id: { in: toWalletIds } }, select: { id: true, alias: true, address: true } }),
  ]);

  const fromWalletMap = new Map<string, any>(fromWallets.map((w: any) => [w.id, w]));
  const toWalletMap = new Map<string, any>(toWallets.map((w: any) => [w.id, w]));

  // Collect chain addresses for contact lookup（直接使用交易表中的 fromAddress / toAddress）
  const addresses = new Set<string>();
  for (const tx of transactions) {
    addresses.add(tx.fromAddress);
    if (tx.toAddress) addresses.add(tx.toAddress);
  }

  const contacts = await prisma.contact.findMany({
    where: { address: { in: [...addresses] } },
    select: { address: true, name: true },
  });

  const contactMap = new Map<string, string>(contacts.map((c: any) => [c.address, c.name]));

  // 查找 tokenName（tokenSymbol 已在交易表中，只需补充 name）
  const tokenSymbols = [...new Set(transactions.map((tx: any) => tx.tokenSymbol))];
  const tokenRecords = await prisma.token.findMany({
    where: { symbol: { in: tokenSymbols } },
    select: { symbol: true, name: true },
  });
  const tokenNameMap = new Map<string, string>(tokenRecords.map((t: any) => [t.symbol, t.name]));

  const { feeMode } = await getFeeConfig();

  return {
    transactions: transactions.map((tx: any) => formatTransaction(tx, fromWalletMap, toWalletMap, contactMap, tokenNameMap, feeMode)),
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

  // Manually fetch related wallets (for alias info)
  const [fromWallet, toWallet] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: tx.fromWalletId }, select: { alias: true, address: true } }),
    tx.toWalletId ? prisma.wallet.findUnique({ where: { id: tx.toWalletId }, select: { alias: true, address: true } }) : Promise.resolve(null),
  ]);

  const fromWalletMap = new Map([[tx.fromWalletId, fromWallet]]);
  const toWalletMap = new Map(tx.toWalletId && toWallet ? [[tx.toWalletId, toWallet]] : []);

  // Collect chain addresses for contact lookup
  const addressList: string[] = [tx.fromAddress];
  if (tx.toAddress) addressList.push(tx.toAddress);

  const contacts = await prisma.contact.findMany({
    where: { address: { in: addressList } },
    select: { address: true, name: true },
  });

  const contactMap = new Map<string, string>(contacts.map((c: any) => [c.address, c.name]));

  // 查找 tokenName（symbol 不再唯一，取任意一条即可）
  const tokenRecord = await prisma.token.findFirst({
    where: { symbol: tx.tokenSymbol },
    select: { name: true },
  });
  const tokenNameMap = new Map(tokenRecord ? [[tx.tokenSymbol, tokenRecord.name]] : []);

  const { feeMode } = await getFeeConfig();

  return formatTransaction(tx, fromWalletMap, toWalletMap, contactMap, tokenNameMap, feeMode);
}

function formatTransaction(
  tx: any,
  fromWalletMap: Map<string, any>,
  toWalletMap: Map<string, any>,
  contactMap: Map<string, string>,
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

  const fw = fromWalletMap.get(tx.fromWalletId);
  const tw = toWalletMap.get(tx.toWalletId);

  const fromWalletInfo = fw ? { alias: fw.alias || "", address: fw.address } : { alias: tx.fromAddress.slice(0, 10), address: tx.fromAddress };
  const toWalletInfo = tw ? { alias: tw.alias || "", address: tw.address } : { alias: (tx.toAddress || "").slice(0, 10), address: tx.toAddress || "" };

  return {
    id: tx.id,
    txHash: tx.txHash,
    fromWalletId: tx.fromWalletId,
    fromAddress: tx.fromAddress,
    toWalletId: tx.toWalletId || "",
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
    fromContactName: contactMap.get(tx.fromAddress) || "",
    toContactName: contactMap.get(tx.toAddress) || "",
  };
}