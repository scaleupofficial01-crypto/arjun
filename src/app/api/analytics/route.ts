import { getDb } from "@/lib/db";
import { computeAnalytics, tradeToLike } from "@/lib/analytics";
import { json, requireUser } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Full analytics from stored records: win rate, expectancy, profit factor,
 * max drawdown vs true historical peak, equity curve, per-instrument split.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const journalId = new URL(req.url).searchParams.get("journalId");
  const trades = await db.trade.findMany({
    where: { userId: auth.user.id, ...(journalId ? { journalId } : {}) },
    orderBy: { exitAt: "asc" },
  });
  return json({
    journalId: journalId ?? "all",
    analytics: computeAnalytics(trades.map(tradeToLike)),
  });
}
