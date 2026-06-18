/**
 * Seed service — runs on every app startup.
 *
 * Only handles dynamic seed data that depends on environment variables
 * (SEED_PASSWORD). Static seed data (tokens, fiat currencies) is already
 * in prisma/init.sql and does not need to be repeated here.
 *
 * Idempotent: all operations use upsert / ON CONFLICT,
 * so running multiple times is safe.
 */
import prisma from "../config/prisma";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";

const SALT_ROUNDS = 12;

export async function runSeed(): Promise<void> {
  const seedPwd = process.env.SEED_PASSWORD;
  if (!seedPwd) {
    logger.info("SEED", "⏭  SEED_PASSWORD not set — skipping seed");
    return;
  }

  logger.info("SEED", "Running seed data...");

  // ── 1. Seed admin user (damotou) ────────────────────────────────────────
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

  // ── 2. Seed wallet for damotou ──────────────────────────────────────────
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

  // ── 3. Seed wallet token balances ───────────────────────────────────────
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

  // ── 4. Link damotou ↔ wallet ────────────────────────────────────────────
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

  await prisma.$executeRawUnsafe(`
    UPDATE "user_wallets" uw
    SET "is_active" = true
    FROM "users" u, "wallets" w
    WHERE u."username" = 'damotou'
      AND w."address" = '0xDAMOTOU00000000000000000000000000000001'
      AND uw."user_id" = u."id"
      AND uw."wallet_id" = w."id";
  `);

  // ── 5. Fix admin user role ──────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    UPDATE "users"
    SET "role" = 'ADMIN', "updated_at" = NOW()
    WHERE "username" = 'admin'
      AND "deleted_at" IS NULL
      AND "role" != 'ADMIN';
  `);

  // ── 6. Other ADMIN users → NORMAL (except admin & damotou) ──────────────
  await prisma.$executeRawUnsafe(`
    UPDATE "users"
    SET "role" = 'NORMAL', "updated_at" = NOW()
    WHERE "username" NOT IN ('admin', 'damotou')
      AND "deleted_at" IS NULL
      AND "role" = 'ADMIN';
  `);

  logger.info("SEED", "🎉 Seed complete");
}