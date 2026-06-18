/**
 * Seed service — runs on every app startup.
 *
 * Idempotent: all operations use upsert / ON CONFLICT,
 * so running multiple times is safe.
 *
 * Tables with Prisma models → use PrismaClient
 * Tables without Prisma models (users, user_wallets) → use raw SQL
 *
 * Zero external dependencies beyond what the app already uses.
 */
import prisma from "../config/prisma";
import bcrypt from "bcrypt";
import { logger } from "../utils/logger";

const SALT_ROUNDS = 12;

export async function runSeed(): Promise<void> {
  logger.info("SEED", "Running seed data...");

  // ── 1. Seed admin user (damotou) — raw SQL, no Prisma model ─────────────
  const seedPwd = process.env.SEED_PASSWORD;
  if (seedPwd) {
    const passwordHash = await bcrypt.hash(seedPwd, SALT_ROUNDS);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "users" ("id", "username", "password_hash", "device_info", "status", "role", "created_at", "updated_at")
      VALUES (gen_random_uuid(), 'damotou', '${passwordHash}', '', 'ACTIVE', 'ADMIN', NOW(), NOW())
      ON CONFLICT ("username") DO UPDATE
      SET "password_hash" = EXCLUDED."password_hash",
          "status"        = 'ACTIVE',
          "role"          = 'ADMIN',
          "deleted_at"    = NULL,
          "updated_at"    = NOW();
    `);
    logger.info("SEED", "✅ damotou user ready (ADMIN, ACTIVE)");
  } else {
    logger.info("SEED", "⏭  SEED_PASSWORD not set — skipping damotou user creation");
  }

  // ── 2. Seed tokens (USDT, TRX) — Prisma model exists ────────────────────
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

  // ── 3. Seed wallet for damotou — Prisma model exists ────────────────────
  const wallet = await prisma.wallet.upsert({
    where: { address: "0xDAMOTOU00000000000000000000000000000001" },
    update: {},
    create: {
      identifier: "aqud" + Math.random().toString(36).substring(2, 34),
      alias: "主钱包",
      address: "0xDAMOTOU00000000000000000000000000000001",
      source: "CREATE",
      memo: "种子数据-内置钱包",
      password: "",
    },
  });

  // ── 4. Seed wallet token balances — Prisma model exists ──────────────────
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

  // ── 5. Link damotou ↔ wallet — raw SQL, no Prisma model ─────────────────
  if (seedPwd) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "user_wallets" ("id", "user_id", "wallet_id", "is_active", "created_at")
      SELECT gen_random_uuid(), u."id", w."id", true, NOW()
      FROM "users" u, "wallets" w
      WHERE u."username" = 'damotou'
        AND w."address" = '0xDAMOTOU00000000000000000000000000000001'
        AND NOT EXISTS (
          SELECT 1 FROM "user_wallets" uw
          WHERE uw."user_id" = u."id" AND uw."wallet_id" = w."id"
        );
    `);

    // Activate if already linked
    await prisma.$executeRawUnsafe(`
      UPDATE "user_wallets" uw
      SET "is_active" = true
      FROM "users" u, "wallets" w
      WHERE u."username" = 'damotou'
        AND w."address" = '0xDAMOTOU00000000000000000000000000000001'
        AND uw."user_id" = u."id"
        AND uw."wallet_id" = w."id";
    `);
  }

  // ── 6. Seed fiat currencies — Prisma model exists ───────────────────────
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

  // ── 7. Fix admin user role — raw SQL ────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    UPDATE "users"
    SET "role" = 'ADMIN', "updated_at" = NOW()
    WHERE "username" = 'admin'
      AND "deleted_at" IS NULL
      AND "role" != 'ADMIN';
  `);

  // ── 8. Other ADMIN users → NORMAL (except admin & damotou) ──────────────
  await prisma.$executeRawUnsafe(`
    UPDATE "users"
    SET "role" = 'NORMAL', "updated_at" = NOW()
    WHERE "username" NOT IN ('admin', 'damotou')
      AND "deleted_at" IS NULL
      AND "role" = 'ADMIN';
  `);

  logger.info("SEED", "🎉 Seed complete");
}
