const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT name FROM _migrations WHERE name = 'init'"
    );
    console.log("_migrations exists, init record:", rows.length > 0 ? "YES" : "NO");
  } catch (err) {
    console.log("_migrations table does not exist (database not initialized yet)");
  }
  await prisma.$disconnect();
}

main();
