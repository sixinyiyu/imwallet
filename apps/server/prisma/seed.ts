import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始种子数据...");

  // 1. Seed token data (USDT and TRX)
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

  // 2. 创建种子钱包（无设备关联，需通过 API 注册设备后关联）
  const wallet = await prisma.wallet.upsert({
    where: { address: "0xSEED000000000000000000000000000000000001" },
    update: {},
    create: {
      identifier: "aqudseed00000000000000000000000001",
      alias: "种子钱包",
      address: "0xSEED000000000000000000000000000000000001",
      source: "CREATE",
      isBackedUp: true,
      memo: "种子数据-内置钱包",
    },
  });
  console.log(`✅ 种子钱包已创建/更新`);
  console.log(`   钱包ID: ${wallet.id}`);

  // 3. 创建 WalletToken entries for seed wallet
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

  // 4. 确保法币汇率数据存在
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

  // 5. 提示：管理员设备需要手动添加到 admins 表
  console.log("");
  console.log("⚠️  管理员设备需手动添加到 admins 表：");
  console.log("   INSERT INTO admins (device_id, role) VALUES ('<your_device_public_key_hex>', 'ADMIN');");

  await prisma.$disconnect();
  console.log("🎉 种子数据完成！");
}

main().catch((e) => {
  console.error("种子数据失败:", e);
  process.exit(1);
});
