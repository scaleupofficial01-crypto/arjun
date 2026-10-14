"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  BaselineSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import { buildEquityCurve } from "@/lib/equity";
import type { MapDeal } from "@/lib/trade-map";

/**
 * Equity curve — the account's realized P&L accumulating over synced deals.
 * Zero-baseline area: green above breakeven, red below (MT5 report style).
 */
export default function EquityChart({ deals }: { deals: MapDeal[] }) {
  const curve = useMemo(() => buildEquityCurve(deals), [deals]);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || curve.points.length === 0) return;
    host.innerHTML = "";
    const chart = createChart(host, {
      autoSize: true,
      height: 200,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.07)" },
        horzLines: { color: "rgba(148,163,184,0.07)" },
      },
      timeScale: { borderColor: "rgba(148,163,184,0.25)", timeVisible: true },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.25)" },
    });
    const s = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: "#22c55e",
      topFillColor1: "rgba(34,197,94,0.28)",
      topFillColor2: "rgba(34,197,94,0.02)",
      bottomLineColor: "#ef4444",
      bottomFillColor1: "rgba(239,68,68,0.02)",
      bottomFillColor2: "rgba(239,68,68,0.28)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    s.setData(curve.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [curve]);

  if (curve.points.length === 0) {
    return (
      <div className="text-sm text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
        Equity curve builds itself as your terminal syncs closed deals.
      </div>
    );
  }
  const money = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-[var(--color-accent)]">Equity curve — realized P&L</h3>
        <span className="ml-auto text-xs text-[var(--color-muted)]">
          net <span className={curve.net >= 0 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}>{money(curve.net)}</span>
          {" · "}{curve.wins}W/{curve.losses}L · win rate {(curve.winRate * 100).toFixed(0)}%
        </span>
      </div>
      <div ref={hostRef} className="rounded-lg overflow-hidden border border-[var(--color-border)]" />
      <p className="text-[11px] text-[var(--color-muted)]">
        Cumulative profit + commission + swap from your synced deals (terminal-reported), zero baseline.
        Journal ki apni server-side pnl recomputation alag hai — yeh reporting view hai.
      </p>
    </div>
  );
}
