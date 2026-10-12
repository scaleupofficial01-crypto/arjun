"use client";

import { useEffect, useMemo, useState } from "react";

interface DayTrade { id: string; symbol: string; side: string; pnl: string | null }

function fmt(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function CalendarApp({ initialMonth }: { initialMonth: string | null }) {
  const [month, setMonth] = useState(initialMonth ?? new Date().toISOString().slice(0, 7));
  const [dailyPnl, setDailyPnl] = useState<Record<string, string>>({});
  const [monthPnl, setMonthPnl] = useState<string>("0");
  const [dayTrades, setDayTrades] = useState<Record<string, DayTrade[]>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/calendar?month=${month}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "load failed");
        setDailyPnl(data.dailyPnl ?? {});
        setMonthPnl(data.monthlyPnl?.[month] ?? "0");
        setDayTrades(data.dayTrades ?? {});
        setSelectedDay(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  const cells = useMemo(() => {
    const [y, mo] = month.split("-").map(Number);
    const firstDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // Mon start
    const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysIn; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  function shiftMonth(delta: number) {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  }

  const maxAbs = Math.max(1, ...Object.values(dailyPnl).map((v) => Math.abs(Number(v))));
  const monthNum = Number(monthPnl);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold">P&L Calendar</h1>
        <span className={`badge ${monthNum >= 0 ? "badge-live" : "badge-setup"}`}>
          {month}: {fmt(monthNum)}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="px-3 py-1.5 rounded-lg border border-[var(--color-border)]" onClick={() => shiftMonth(-1)}>←</button>
          <button className="px-3 py-1.5 rounded-lg border border-[var(--color-border)]" onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>Today</button>
          <button className="px-3 py-1.5 rounded-lg border border-[var(--color-border)]" onClick={() => shiftMonth(1)}>→</button>
        </div>
      </div>
      {error && <div className="card p-3 text-sm text-[var(--color-loss)]">{error}</div>}
      <div className="card p-4">
        <div className="grid grid-cols-7 gap-1 text-xs text-[var(--color-muted)] mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="p-1 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-20 rounded bg-transparent" />;
            const pnl = dailyPnl[day] !== undefined ? Number(dailyPnl[day]) : null;
            const intensity = pnl === null ? 0 : Math.min(0.85, Math.abs(pnl) / maxAbs * 0.85);
            const bg = pnl === null ? "var(--color-panel-2)"
              : pnl > 0 ? `rgba(34,197,94,${0.12 + intensity})`
              : pnl < 0 ? `rgba(239,68,68,${0.12 + intensity})`
              : "var(--color-panel-2)";
            const selected = selectedDay === day;
            // strong cells get dark text for contrast
            const strong = pnl !== null && intensity > 0.45;
            const pnlColor = strong ? "#0a0f1a" : pnl !== null && pnl > 0 ? "text-[var(--color-profit)]" : pnl !== null && pnl < 0 ? "text-[var(--color-loss)]" : "text-[var(--color-muted)]";
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(pnl === null ? null : day)}
                className={`min-h-20 rounded p-1.5 text-left flex flex-col justify-between transition ${selected ? "ring-2 ring-[var(--color-accent)]" : ""}`}
                style={{ background: bg }}
              >
                <span className="text-xs" style={{ color: strong ? "#0a0f1acc" : "var(--color-muted)" }}>{Number(day.slice(8))}</span>
                {pnl !== null && (
                  <span className={`text-sm font-semibold ${strong ? "" : pnlColor}`} style={strong ? { color: "#0a0f1a" } : undefined}>
                    {fmt(pnl)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {loading && <p className="text-xs text-[var(--color-muted)] mt-2">loading…</p>}
      </div>

      {selectedDay && (
        <div className="card p-4">
          <h3 className="font-semibold mb-2">
            {selectedDay} — {dayTrades[selectedDay]?.length ?? 0} closed trades · day P&L{" "}
            <span className={Number(dailyPnl[selectedDay]) >= 0 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}>
              {fmt(Number(dailyPnl[selectedDay] ?? 0))}
            </span>
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {(dayTrades[selectedDay] ?? []).map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="p-2 font-semibold">{t.symbol}</td>
                  <td className={`p-2 ${t.side === "BUY" ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}`}>{t.side}</td>
                  <td className={`p-2 text-right font-semibold ${Number(t.pnl) >= 0 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}`}>{fmt(Number(t.pnl ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[var(--color-muted)]">Heatmap computed only from your stored closed trades — no fabricated numbers. Click a day to see its entries.</p>
    </div>
  );
}
