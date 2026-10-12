import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { computeAnalytics, tradeToLike } from "@/lib/analytics";
import { json, requireUser } from "@/lib/api";

export const runtime = "nodejs";

/** Daily/monthly P&L for the heatmap — computed from stored trades only. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month"); // YYYY-MM
  const journalId = url.searchParams.get("journalId");

  const where: Prisma.TradeWhereInput = { userId: auth.user.id, status: "CLOSED" };
  if (journalId) where.journalId = journalId;
  const trades = await db.trade.findMany({ where, orderBy: { exitAt: "asc" } });
  const analytics = computeAnalytics(trades.map(tradeToLike));

  let dayTrades: Record<string, { id: string; symbol: string; side: string; pnl: string | null }[]> = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const list = trades.filter((t) => t.exitAt && t.exitAt.toISOString().startsWith(month));
    for (const t of list) {
      const day = t.exitAt!.toISOString().slice(0, 10);
      (dayTrades[day] ??= []).push({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        pnl: t.pnl?.toString() ?? null,
      });
    }
  } else {
    dayTrades = {};
  }

  return json({
    month: month ?? null,
    dailyPnl: analytics.dailyPnl,
    monthlyPnl: analytics.monthlyPnl,
    dayTrades,
  });
}
