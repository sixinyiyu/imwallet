/**
 * Seed service — runs on every app startup.
 *
 * Idempotent: all operations use upsert / ON CONFLICT DO NOTHING,
 * so running multiple times is safe.
 *
 * Uses the existing PrismaClient + bcrypt — zero external dependencies.
 */
import prisma from "../config/prisma";
import bcrypt from "bcrypt";
import { logger } from "../utils/logger";

const SALT_ROUNDS = 12;

export async function runSeed(): Promise<void> {
  logger.info("SEED", "Running seed data...");

  // ── 1. Seed admin user (damotou) ──────────────────────────────────────────
  const seedPwd = process.env.SEED_PASSWORD;
  if (seedPwd) {
    const passwordHash = await bcrypt.hash(seedPwd, SALT_ROUNDS);

    await prisma.user.upsert({
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
    logger.info("SEED", "✅ damotou user ready (ADMIN, ACTIVE)");
  } else {
    logger.info("SEED", "⏭  SEED_PASSWORD not set — skipping damotou user creation");
  }

  // ── 2. Seed tokens (USDT, TRX) ───────────────────────────────────────────
  await prisma.token.upsert({
    where: { symbol: "USDT" },
    update: {},
    create: {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      network: "Tron",
      isActive: true,
    },
  });

  await prisma.token.upsert({
    where: { symbol: "TRX" },
    update: {},
    create: {
      symbol: "TRX",
      name: "Tron",
      decimals: 6,
      network: "Tron",
      isActive: true,
    },
  });
  logger.info("SEED", "✅ Tokens USDT/TRX ready");

  // ── 3. Seed wallet for damotou ────────────────────────────────────────────
  const wallet = await prisma.wallet.upsert({
    where: { address: "0xDAMOTOU00000000000000000000000000000001" },
    update: {},
    create: {
      alias: "主钱包",
      address: "0xDAMOTOU00000000000000000000000000000001",
      source: "CREATE",
      memo: "种子数据-内置钱包",
      password: "",
    },
  });

  // ── 4. Seed wallet token balances ─────────────────────────────────────────
  const usdt = await prisma.token.findUnique({ where: { symbol: "USDT" } });
  const trx = await prisma.token.findUnique({ where: { symbol: "TRX" } });

  if (usdt) {
    await prisma.walletToken.upsert({
      where: { walletId_tokenId: { walletId: wallet.id, tokenId: usdt.id } },
      update: { balance: 90000000 },
      create: { walletId: wallet.id, tokenId: usdt.id, balance: 90000000 },
    });
  }

  if (trx) {
    await prisma.walletToken.upsert({
      where: { walletId_tokenId: { walletId: wallet.id, tokenId: trx.id } },
      update: { balance: 100000 },
      create: { walletId: wallet.id, tokenId: trx.id, balance: 100000 },
    });
  }
  logger.info("SEED", "✅ Wallet balances ready");

  // ── 5. Link damotou ↔ wallet ──────────────────────────────────────────────
  if (seedPwd) {
    const damotou = await prisma.user.findUnique({ where: { username: "damotou" } });
    if (damotou) {
      await prisma.userWallet.upsert({
        where: {
          userId_walletId: { userId: damotou.id, walletId: wallet.id },
        },
        update: { isActive: true },
        create: {
          userId: damotou.id,
          walletId: wallet.id,
          isActive: true,
        },
      });
    }
  }

  // ── 6. Seed fiat currencies ───────────────────────────────────────────────
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
  logger.info("SEED", "✅ Fiat currencies ready");

  // ── 7. Fix admin user role ────────────────────────────────────────────────
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  if (adminUser && !adminUser.deletedAt) {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: "ADMIN" },
    });
  }

  // ── 8. Other ADMIN users → NORMAL (except admin & damotou) ────────────────
  await prisma.user.updateMany({
    where: {
      username: { notIn: ["admin", "damotou"] },
      deletedAt: null,
      role: "ADMIN",
    },
    data: { role: "NORMAL" },
  });

  logger.info("SEED", "🎉 Seed complete");
}
