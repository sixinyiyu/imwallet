const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();

  // Drop remaining items that were missed
  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS _migrations CASCADE");
  console.log("OK: DROP TABLE _migrations");

  await prisma.$executeRawUnsafe("DROP TYPE IF EXISTS \"WalletSource\" CASCADE");
  console.log("OK: DROP TYPE WalletSource");

  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS notification_reads CASCADE");
  console.log("OK: DROP TABLE notification_reads");

  // Verify everything is gone
  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    console.log("\nRemaining public tables:", tables.length === 0 ? "NONE (clean!)" : tables.map((t) => t.tablename));
  } catch (err) {
    console.log("Check error:", err.message);
  }

  await prisma.$disconnect();
}

main();
