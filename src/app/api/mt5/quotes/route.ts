import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Latest bid/ask for an MT5 account's symbols — THE TERMINAL'S OWN BROKER
 * FEED, pushed by the v2 EA on every sync. Never a third-party quote.
 * `ageS` tells the UI how stale the tick is; old ticks are labeled, never
 * silently presented as live.
 *
 * GET /api/mt5/quotes?account=<id>[&symbol=XAUUSD]
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`mt5quotes:${auth.user.id}`, 60, 60);
  if (!rl.ok) return rateLimited(rl);

  const url = new URL(req.url);
  const accountId = (url.searchParams.get("account") ?? "").trim();
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!accountId) return json({ error: "account param required" }, { status: 400 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const account = await db.mt5Account.findFirst({
    where: { id: accountId, userId: auth.user.id },
    select: { id: true, lastSyncAt: true, eaVersion: true },
  });
  if (!account) return json({ error: "Account not found" }, { status: 404 });

  const rows = await db.mt5Quote.findMany({
    where: { accountId: account.id, ...(symbol ? { symbol } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  const now = Date.now();
  return json({
    account: { id: account.id, lastSyncAt: account.lastSyncAt, eaVersion: account.eaVersion },
    quotes: rows.map((q) => ({
      symbol: q.symbol,
      bid: q.bid.toString(),
      ask: q.ask.toString(),
      tickAt: q.tickAt?.toISOString() ?? null,
      updatedAt: q.updatedAt.toISOString(),
      ageS: Math.max(0, Math.round((now - q.updatedAt.getTime()) / 1000)),
    })),
    time: new Date().toISOString(),
  });
}
