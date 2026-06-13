import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始种子数据...");

  const SALT_ROUNDS = 12;

  // 1. 创建 damotou 用户（ADMIN 角色，已激活）
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || "changeme", SALT_ROUNDS);

  const damotou = await prisma.user.upsert({
    where: { username: "damotou" },
    update: {
      passwordHash,
      status: "ACTIVE",
      role: "ADMIN",
      deletedAt: null,
    },
    create: {
      username: "damotou",
      passwordHash,
      status: "ACTIVE",
      role: "ADMIN",
      deviceInfo: "",
    },
  });
  console.log(`✅ 用户 damotou 已创建/更新 (角色: ADMIN, 状态: ACTIVE)`);
  console.log(`   用户ID: ${damotou.id}`);

  // 2. Seed token data (USDT and TRX)
  const usdtToken = await prisma.token.upsert({
    where: { symbol: "USDT" },
    update: {
      name: "Tether USD",
      decimals: 6,
      network: "Private Chain",
      isActive: true,
    },
    create: {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      network: "Private Chain",
      isActive: true,
    },
  });
  console.log(`✅ USDT 代币已创建/更新 (ID: ${usdtToken.id})`);

  const trxToken = await prisma.token.upsert({
    where: { symbol: "TRX" },
    update: {
      name: "Tron",
      decimals: 6,
      network: "Tron Network",
      isActive: true,
    },
    create: {
      symbol: "TRX",
      name: "Tron",
      decimals: 6,
      network: "Tron Network",
      isActive: true,
    },
  });
  console.log(`✅ TRX 代币已创建/更新 (ID: ${trxToken.id})`);

  // 3. 为 damotou 创建钱包
  const wallet = await prisma.wallet.upsert({
    where: { address: "0xDAMOTOU00000000000000000000000000000001" },
    update: {},
    create: {
      alias: "damotou 主钱包",
      address: "0xDAMOTOU00000000000000000000000000000001",
      source: "CREATE",
      memo: "种子数据-内置钱包",
    },
  });
  console.log(`✅ 钱包已创建/更新`);
  console.log(`   钱包ID: ${wallet.id}`);

  // 4. 创建 WalletToken entries for damotou wallet (USDT balance=90000000, TRX balance=90000000)
  await prisma.walletToken.upsert({
    where: {
      walletId_tokenId: {
        walletId: wallet.id,
        tokenId: usdtToken.id,
      },
    },
    update: {
      balance: 90000000,
    },
    create: {
      walletId: wallet.id,
      tokenId: usdtToken.id,
      balance: 90000000,
    },
  });
  console.log(`✅ USDT WalletToken 已创建/更新 (余额: 90,000,000)`);

  await prisma.walletToken.upsert({
    where: {
      walletId_tokenId: {
        walletId: wallet.id,
        tokenId: trxToken.id,
      },
    },
    update: {
      balance: 90000000,
    },
    create: {
      walletId: wallet.id,
      tokenId: trxToken.id,
      balance: 90000000,
    },
  });
  console.log(`✅ TRX WalletToken 已创建/更新 (余额: 90,000,000)`);

  // 5. 关联 damotou 与钱包
  await prisma.userWallet.upsert({
    where: {
      userId_walletId: {
        userId: damotou.id,
        walletId: wallet.id,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      userId: damotou.id,
      walletId: wallet.id,
      isActive: true,
    },
  });
  console.log(`✅ 用户钱包关联已创建`);

  // 6. 确保法币汇率数据存在
  const fiatDefaults = [
    { code: "USD", name: "US Dollar", symbol: "$", rate: 1.0, decimals: 2 },
    { code: "CNY", name: "人民币", symbol: "¥", rate: 7.25, decimals: 2 },
    { code: "EUR", name: "Euro", symbol: "€", rate: 0.92, decimals: 2 },
    { code: "JPY", name: "Japanese Yen", symbol: "¥", rate: 155.0, decimals: 0 },
  ];

  for (const fiat of fiatDefaults) {
    await prisma.fiatCurrency.upsert({
      where: { code: fiat.code },
      update: { rate: fiat.rate },
      create: fiat,
    });
  }
  console.log(`✅ 法币汇率数据已创建/更新 (${fiatDefaults.length} 种)`);

  // 7. 确保现有 admin 用户也更新角色
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  if (adminUser && !adminUser.deletedAt) {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: "ADMIN" },
    });
    console.log(`✅ 用户 admin 角色已更新为 ADMIN`);
  }

  // 8. 确保现有用户都设置为 NORMAL 角色（除了 admin 和 damotou）
  const otherUsers = await prisma.user.findMany({
    where: {
      username: { notIn: ["admin", "damotou"] },
      deletedAt: null,
      role: "ADMIN",
    },
  });
  for (const u of otherUsers) {
    await prisma.user.update({
      where: { id: u.id },
      data: { role: "NORMAL" },
    });
    console.log(`✅ 用户 ${u.username} 角色已更新为 NORMAL`);
  }

  await prisma.$disconnect();
  console.log("🎉 种子数据完成！");
}

main().catch((e) => {
  console.error("种子数据失败:", e);
  process.exit(1);
});