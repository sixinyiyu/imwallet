/**
 * Database initializer — Flyway-style, single-file approach.
 *
 * On every app startup:
 * 1. If _migrations table has 'init' record → database already initialized, skip
 * 2. If not → execute prisma/init.sql (all tables + seed data in one file)
 *
 * init.sql is fully idempotent (IF NOT EXISTS / DO $$ EXCEPTION), safe to re-run.
 *
 * Zero external dependencies — uses the existing PrismaClient connection.
 */
import prisma from "../config/prisma";
import { logger } from "../utils/logger";
import { splitSql } from "./sqlSplitter";
import * as fs from "fs";
import * as path from "path";

const INIT_SQL_PATH = path.resolve(__dirname, "../../prisma/init.sql");
const MIGRATIONS_TABLE = "_migrations";

// ─── Check if database has been initialized ──────────────────────────────────
async function isDatabaseInitialized(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name FROM "${MIGRATIONS_TABLE}" WHERE name = 'init';`
    ) as Array<{ name: string }>;
    return rows.length > 0;
  } catch {
    // Table doesn't exist yet → not initialized
    return false;
  }
}

// ─── Run database initialization ─────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  logger.info("MIGRATE", "========================================");
  logger.info("MIGRATE", "  Checking database initialization...");
  logger.info("MIGRATE", "========================================");

  // Check if already initialized
  if (await isDatabaseInitialized()) {
    logger.info("MIGRATE", "✅ Database already initialized — skipping.");
    return;
  }

  // Execute init.sql
  if (!fs.existsSync(INIT_SQL_PATH)) {
    logger.error("MIGRATE", `❌ init.sql not found at ${INIT_SQL_PATH}`);
    throw new Error("prisma/init.sql not found");
  }

  const sql = fs.readFileSync(INIT_SQL_PATH, "utf-8");
  const statements = splitSql(sql);

  logger.info("MIGRATE", `🌱 Initializing database: ${statements.length} SQL statements from init.sql`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const isStructural = stmt.startsWith("CREATE") || stmt.startsWith("ALTER") || stmt.startsWith("INSERT") || stmt.startsWith("DO");
    if (isStructural || (i + 1) % 10 === 0 || i === statements.length - 1) {
      const preview = stmt.length > 80 ? stmt.substring(0, 80) + "..." : stmt;
      logger.info("MIGRATE", `  [${i + 1}/${statements.length}] ${preview}`);
    }

    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: any) {
      logger.error("MIGRATE", `❌ Statement ${i + 1} failed: ${stmt.substring(0, 120)}`);
      logger.error("MIGRATE", `❌ Error: ${err.message}`);
      throw err;
    }
  }

  logger.info("MIGRATE", "========================================");
  logger.info("MIGRATE", "  ✅ Database initialized successfully!");
  logger.info("MIGRATE", `  ${statements.length} statements executed`);
  logger.info("MIGRATE", "========================================");
}
