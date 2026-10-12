import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";
import { computeAnalytics, tradeToLike } from "@/lib/analytics";
import Link from "next/link";

export const metadata = { title: "Analytics — Empire" };
export const dynamic = "force-dynamic";

function fmt(v: string | null, digits = 2): string {
  if (v === null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function cls(v: string | null): string {
  if (v === null) return "";
  const n = Number(v);
  return n > 0 ? "text-[var(--color-profit)]" : n < 0 ? "text-[var(--color-loss)]" : "";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ journalId?: string }>;
}) {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const { journalId } = await searchParams;

  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen"><AppNav active="analytics" />
        <div className="max-w-4xl mx-auto p-8"><div className="card p-6"><span className="badge badge-setup">Database setup required</span></div></div>
      </main>
    );
  }

  const journals = await db.journal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const validJid = journalId && journals.some((j) => j.id === journalId) ? journalId : null;
  const trades = await db.trade.findMany({
    where: { userId: user.id, ...(validJid ? { journalId: validJid } : {}) },
    orderBy: { exitAt: "asc" },
  });
  const a = computeAnalytics(trades.map(tradeToLike));

  // Equity curve SVG points
  const W = 760, H = 220, PAD = 24;
  const curve = a.equityCurve;
  let path = "";
  if (curve.length > 0) {
    const vals = curve.map((p) => Number(p.equity));
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    const span = max - min || 1;
    path = vals
      .map((v, i) => {
        const x = PAD + (i * (W - 2 * PAD)) / Math.max(1, vals.length - 1);
        const y = H - PAD - ((v - min) / span) * (H - 2 * PAD);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const cards: [string, string, string][] = [
    ["Net P&L", fmt(a.netPnl), cls(a.netPnl)],
    ["Win rate", a.closedTrades > 0 ? `${a.winRate}%` : "—", ""],
    ["Profit factor", a.profitFactor ?? "—", a.profitFactor && Number(a.profitFactor) >= 1 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"],
    ["Expectancy / trade", a.closedTrades > 0 ? fmt(a.expectancy) : "—", cls(a.expectancy)],
    ["Max drawdown (vs peak)", fmt(a.maxDrawdown), "text-[var(--color-loss)]"],
    ["Avg win", fmt(a.avgWin), "text-[var(--color-profit)]"],
    ["Avg loss", fmt(a.avgLoss), "text-[var(--color-loss)]"],
    ["Trades (closed/open)", `${a.closedTrades} / ${a.openTrades}`, ""],
  ];

  return (
    <main className="min-h-screen">
      <AppNav active="analytics" />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">Analytics</h1>
          <nav className="flex gap-2">
            <Link href="/analytics" className={`badge ${!validJid ? "badge-live" : ""}`}>All journals</Link>
            {journals.map((j) => (
              <Link key={j.id} href={`/analytics?journalId=${j.id}`} className={`badge ${validJid === j.id ? "badge-live" : ""}`}>{j.name}</Link>
            ))}
          </nav>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map(([label, value, c]) => (
            <div key={label} className="card p-4">
              <div className="text-xs text-[var(--color-muted)]">{label}</div>
              <div className={`text-2xl font-bold mt-1 ${c}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-1">Equity curve</h3>
          <p className="text-xs text-[var(--color-muted)] mb-3">
            Cumulative P&L of closed trades by exit time (starts at 0). Wins: {a.winCount} · Losses: {a.lossCount} · Breakeven: {a.breakevenCount}
          </p>
          {curve.length > 0 ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="var(--color-border)" strokeDasharray="4 4" />
              <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
            </svg>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No closed trades yet — your curve appears once trades close.</p>
          )}
          {a.maxDrawdownFromPeak && (
            <p className="text-xs text-[var(--color-muted)] mt-2">
              Worst drop: peak {fmt(a.maxDrawdownFromPeak.peak)} → trough {fmt(a.maxDrawdownFromPeak.trough)} (drawdown {fmt(a.maxDrawdown)} vs the true historical peak, not just the start).
            </p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3">Per-instrument breakdown</h3>
          {a.perInstrument.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <th className="py-2">Symbol</th><th className="py-2">Trades</th><th className="py-2">W/L</th>
                  <th className="py-2">Win rate</th><th className="py-2">Profit factor</th><th className="py-2 text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {a.perInstrument.map((r) => (
                  <tr key={r.symbol} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 font-semibold">{r.symbol}</td>
                    <td className="py-2">{r.trades}</td>
                    <td className="py-2">{r.wins}/{r.losses}</td>
                    <td className="py-2">{r.winRate}%</td>
                    <td className="py-2">{r.profitFactor ?? "—"}</td>
                    <td className={`py-2 text-right font-semibold ${cls(r.netPnl)}`}>{fmt(r.netPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No closed trades yet.</p>
          )}
        </div>
        <p className="text-xs text-[var(--color-muted)]">Every number above is computed from your stored trade records only.</p>
      </div>
    </main>
  );
}
