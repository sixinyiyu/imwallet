/**
 * Flyway-style database migrator.
 *
 * On every app startup, reads SQL files from prisma/migrations/<folder>/migration.sql,
 * tracks executed ones in the _migrations table, and runs any pending migrations
 * inside a transaction.
 *
 * Migration from Prisma: on first run, detects _prisma_migrations table and
 * imports all previously-applied migration names into _migrations, so we don't
 * re-run migrations that Prisma already applied.
 *
 * Checksum validation: if an already-applied migration file is modified,
 * startup will fail with a clear error (same as Flyway).
 *
 * Zero external dependencies — uses the existing PrismaClient connection.
 */
import prisma from "../config/prisma";
import { logger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../prisma/migrations");
const MIGRATIONS_TABLE = "_migrations";
const PRISMA_MIGRATIONS_TABLE = "_prisma_migrations";

// ─── Compute checksum for a SQL string ───────────────────────────────────────
function checksum(sql: string): string {
  return createHash("md5").update(sql).digest("hex");
}

// ─── Ensure tracking table exists (with checksum column) ─────────────────────
async function ensureMigrationsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL UNIQUE,
      checksum   VARCHAR(32)  NOT NULL,
      applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Backfill: if table exists but lacks checksum column (upgrade from v1), add it
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${MIGRATIONS_TABLE}' AND column_name = 'checksum';`
  ) as Array<{ column_name: string }>;

  if (cols.length === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${MIGRATIONS_TABLE}" ADD COLUMN checksum VARCHAR(32) NOT NULL DEFAULT '';`
    );
    logger.warn("MIGRATE", "Added checksum column to _migrations table (existing records have empty checksum — will not be validated).");
  }
}

// ─── Import previously-applied Prisma migrations into our tracking table ──────
async function importPrismaMigrations(): Promise<void> {
  // Check if _prisma_migrations table exists
  const tableExists = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_name = '${PRISMA_MIGRATIONS_TABLE}';`
  ) as Array<{ table_name: string }>;

  if (tableExists.length === 0) {
    logger.info("MIGRATE", "No _prisma_migrations table found — fresh database, no import needed.");
    return;
  }

  // Get Prisma-applied migration names
  const prismaRows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "${PRISMA_MIGRATIONS_TABLE}" WHERE finished_at IS NOT NULL;`
  ) as Array<{ migration_name: string }>;

  if (prismaRows.length === 0) {
    logger.info("MIGRATE", "_prisma_migrations table exists but has no records — no import needed.");
    return;
  }

  // Get our already-tracked migrations
  const ourRows = await prisma.$queryRawUnsafe(
    `SELECT name FROM "${MIGRATIONS_TABLE}";`
  ) as Array<{ name: string }>;
  const ourNames = new Set(ourRows.map((r) => r.name));

  // Discover local migration files to compute checksums
  const localMigrations = discoverMigrations();
  const localMap = new Map(localMigrations.map((m) => [m.name, m.checksum]));

  // Import any Prisma-applied migrations that we haven't tracked yet
  let imported = 0;
  for (const row of prismaRows) {
    if (ourNames.has(row.migration_name)) continue;

    const cs = localMap.get(row.migration_name) ?? ""; // empty checksum if file not found locally
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name, checksum) VALUES ('${row.migration_name}', '${cs}');`
    );
    imported++;
  }

  if (imported > 0) {
    logger.info("MIGRATE", `Imported ${imported} previously-applied Prisma migration(s) into _migrations table.`);
  } else {
    logger.info("MIGRATE", "All Prisma migrations already tracked — no import needed.");
  }
}

// ─── Get already-applied migrations ──────────────────────────────────────────
async function getAppliedMigrations(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name, checksum FROM "${MIGRATIONS_TABLE}" ORDER BY id;`
  ) as Array<{ name: string; checksum: string }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.name, r.checksum);
  }
  return map;
}

// ─── Discover migration SQL files ────────────────────────────────────────────
function discoverMigrations(): Array<{ name: string; sql: string; checksum: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR).sort();
  const migrations: Array<{ name: string; sql: string; checksum: string }> = [];

  for (const entry of entries) {
    const dirPath = path.join(MIGRATIONS_DIR, entry);
    const migrationFile = path.join(dirPath, "migration.sql");
    if (fs.statSync(dirPath).isDirectory() && fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, "utf-8");
      migrations.push({ name: entry, sql, checksum: checksum(sql) });
    }
  }

  return migrations;
}

// ─── Run all pending migrations ──────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  logger.info("MIGRATE", "Checking for pending database migrations...");

  await ensureMigrationsTable();

  // Import previously-applied Prisma migrations so we don't re-run them
  await importPrismaMigrations();

  const applied = await getAppliedMigrations();
  const all = discoverMigrations();

  // ── 1. Validate checksums of already-applied migrations ──────────────────
  for (const migration of all) {
    const recordedChecksum = applied.get(migration.name);
    if (recordedChecksum === undefined) continue; // pending, not yet applied

    // Empty checksum = imported from Prisma or backfilled, skip validation
    if (recordedChecksum === "") continue;

    if (recordedChecksum !== migration.checksum) {
      const msg =
        `Migration "${migration.name}" was already applied but has been modified!\n` +
        `  Recorded checksum: ${recordedChecksum}\n` +
        `  Current checksum:  ${migration.checksum}\n` +
        `This is a safety check to prevent accidental changes to already-executed migrations.\n` +
        `If this was intentional, you can update the checksum:\n` +
        `  UPDATE _migrations SET checksum = '${migration.checksum}' WHERE name = '${migration.name}';`;

      logger.error("MIGRATE", msg);
      throw new Error(`Checksum mismatch for migration "${migration.name}"`);
    }
  }

  // ── 2. Find and apply pending migrations ─────────────────────────────────
  const pending = all.filter((m) => !applied.has(m.name));

  if (pending.length === 0) {
    logger.info("MIGRATE", "Database is up to date — no pending migrations.");
    return;
  }

  logger.info("MIGRATE", `Found ${pending.length} pending migration(s): ${pending.map((m) => m.name).join(", ")}`);

  for (const migration of pending) {
    logger.info("MIGRATE", `Applying: ${migration.name} ...`);

    await prisma.$transaction(async (tx: any) => {
      const statements = migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt);
      }

      // Record the migration with checksum
      await tx.$executeRawUnsafe(
        `INSERT INTO "${MIGRATIONS_TABLE}" (name, checksum) VALUES ('${migration.name}', '${migration.checksum}');`
      );
    });

    logger.info("MIGRATE", `✅ Applied: ${migration.name}`);
  }

  logger.info("MIGRATE", `All ${pending.length} migration(s) applied successfully.`);
}
