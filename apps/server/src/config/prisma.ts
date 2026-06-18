import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Limit connection pool to prevent exhausting RDS max_connections (default 100)
  // Formula: connection_limit should be ≤ (RDS max_connections - reserved - other services)
  // For a single server instance with max_connections=100, 10 is safe.
  // Override via DATABASE_URL ?connection_limit=10 if needed.
});

// Set PostgreSQL session timezone to Asia/Shanghai for consistent timestamps
prisma.$connect().then(() => {
  return prisma.$executeRawUnsafe("SET timezone = 'Asia/Shanghai'");
}).catch(() => {
  // connection will be retried on first query
});

// Graceful shutdown: disconnect Prisma before process exits
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
});
process.on("SIGINT", async () => {
  await prisma.$disconnect();
});

export default prisma;
