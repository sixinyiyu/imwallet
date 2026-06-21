const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();

  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log("Public tables (" + tables.length + "):");
  for (const t of tables) {
    console.log("  - " + t.tablename);
  }

  // Check seed data
  const chainCount = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM chains");
  const assetCount = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM assets");
  const configCount = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM app_configs");
  const fiatCount = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM fiat_currencies");

  console.log("\nSeed data:");
  console.log("  chains: " + chainCount[0].cnt);
  console.log("  assets: " + assetCount[0].cnt);
  console.log("  app_configs: " + configCount[0].cnt);
  console.log("  fiat_currencies: " + fiatCount[0].cnt);

  await prisma.$disconnect();
}

main();
