/**
 * Flyway-style database migrator.
 *
 * On every app startup, reads SQL files from prisma/migrations/<folder>/migration.sql,
 * tracks executed ones in the _migrations table, and runs any pending migrations
 * inside a transaction.
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
  const applied = await getAppliedMigrations();
  const all = discoverMigrations();

  // ── 1. Validate checksums of already-applied migrations ──────────────────
  for (const migration of all) {
    const recordedChecksum = applied.get(migration.name);
    if (recordedChecksum === undefined) continue; // pending, not yet applied

    // Empty checksum = backfilled from v1 table, skip validation
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
