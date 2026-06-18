/**
 * Database initializer — Flyway-style, single-file approach.
 *
 * On every app startup:
 * 1. If _migrations table has 'init' record → database already initialized, skip
 * 2. If not → execute prisma/init.sql (all tables + seed data in one file)
 *
 * Also imports _prisma_migrations records if the old Prisma tracking table exists,
 * so we don't re-run on databases that were previously managed by Prisma.
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
const PRISMA_MIGRATIONS_TABLE = "_prisma_migrations";

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

// ─── Import Prisma migration records (for existing databases) ────────────────
async function importPrismaMigrations(): Promise<void> {
  const tableExists = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_name = '${PRISMA_MIGRATIONS_TABLE}';`
  ) as Array<{ table_name: string }>;

  if (tableExists.length === 0) return;

  const prismaRows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "${PRISMA_MIGRATIONS_TABLE}" WHERE finished_at IS NOT NULL;`
  ) as Array<{ migration_name: string }>;

  if (prismaRows.length === 0) return;

  // Ensure _migrations table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL UNIQUE,
      checksum   VARCHAR(32)  NOT NULL DEFAULT '',
      applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const ourRows = await prisma.$queryRawUnsafe(
    `SELECT name FROM "${MIGRATIONS_TABLE}";`
  ) as Array<{ name: string }>;
  const ourNames = new Set(ourRows.map((r) => r.name));

  let imported = 0;
  for (const row of prismaRows) {
    if (ourNames.has(row.migration_name)) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name, checksum) VALUES ('${row.migration_name}', '');`
    );
    imported++;
  }

  if (imported > 0) {
    logger.info("MIGRATE", `Imported ${imported} Prisma migration(s) into _migrations.`);
  }
}

// ─── Run database initialization ─────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  logger.info("MIGRATE", "========================================");
  logger.info("MIGRATE", "  Checking database initialization...");
  logger.info("MIGRATE", "========================================");

  // Step 1: If database was managed by Prisma before, import those records
  await importPrismaMigrations();

  // Step 2: Check if already initialized
  if (await isDatabaseInitialized()) {
    logger.info("MIGRATE", "✅ Database already initialized — skipping.");
    return;
  }

  // Step 3: Execute init.sql
  if (!fs.existsSync(INIT_SQL_PATH)) {
    logger.error("MIGRATE", `❌ init.sql not found at ${INIT_SQL_PATH}`);
    throw new Error("prisma/init.sql not found");
  }

  const sql = fs.readFileSync(INIT_SQL_PATH, "utf-8");
  const statements = splitSql(sql);

  logger.info("MIGRATE", `🌱 Initializing fresh database: ${statements.length} SQL statements from init.sql`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Log progress every 10 statements, and always log CREATE/INSERT statements
    const isStructural = stmt.startsWith("CREATE") || stmt.startsWith("ALTER") || stmt.startsWith("INSERT");
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
