/**
 * Seed service — runs on every app startup.
 *
 * Currently no dynamic seed data is needed.
 * Static seed data (tokens, fiat currencies) is in prisma/init.sql.
 *
 * Kept as a placeholder for future seed needs (e.g. default settings).
 */
import { logger } from "../utils/logger";

export async function runSeed(): Promise<void> {
  logger.info("SEED", "No dynamic seed data needed — skipping.");
}
