import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Prisma singleton. `datasourceUrl` uses DATABASE_URL (Supabase pooler with
 * connection_limit≈10 + generous pool_timeout — bug #7). If the database is
 * not configured yet, callers must treat it as setup-required, not fake data.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient | null {
  const url = env.databaseUrl();
  if (!url) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ datasourceUrl: url });
  }
  return globalForPrisma.prisma;
}
