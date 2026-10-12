import { integrationStatus } from "@/lib/env";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Public health/integration status — booleans only, never secrets or
 * connection strings (master prompt §5).
 */
export async function GET() {
  let dbReachable = false;
  const db = getDb();
  if (db) {
    try {
      await db.$queryRaw`SELECT 1`;
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }
  return Response.json({
    app: "empire",
    status: "ok",
    integrations: integrationStatus(),
    databaseReachable: dbReachable,
    time: new Date().toISOString(),
  });
}
