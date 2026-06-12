import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Set PostgreSQL session timezone to Asia/Shanghai for consistent timestamps
prisma.$connect().then(() => {
  return prisma.$executeRawUnsafe("SET timezone = 'Asia/Shanghai'");
}).catch(() => {
  // connection will be retried on first query
});

export default prisma;
