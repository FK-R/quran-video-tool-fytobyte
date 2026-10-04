import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const g = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = g.pgPool ?? new Pool({ connectionString });
  if (process.env.NODE_ENV !== "production") g.pgPool = pool;
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = g.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
