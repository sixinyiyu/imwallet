const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const prisma = new PrismaClient();
  const sql = fs.readFileSync(path.join(__dirname, "../prisma/drop-all.sql"), "utf-8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log("Executing " + statements.length + " drop statements...");
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log("  OK: " + stmt.substring(0, 80));
    } catch (err) {
      console.log("  SKIP: " + err.message.substring(0, 100));
    }
  }
  console.log("\nDone! Database cleared. Restart the server to auto-rebuild via init.sql.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});