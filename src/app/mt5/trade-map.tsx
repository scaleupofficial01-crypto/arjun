"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { buildTradeMap, type MapDeal, type SymbolMap } from "@/lib/trade-map";

/**
 * Trade Map — synced MT5 deals on a chart, TradingView-style:
 * ▲ entry arrows, ▼ exit arrows, and a green/red connector per round-trip.
 * Plotted from the deals' OWN prices (no external market feed — free tier
 * has no forex/metals OHLC; nothing is faked as candles).
 */
export default function TradeMap({ deals }: { deals: MapDeal[] }) {
  const maps = useMemo(() => buildTradeMap(deals), [deals]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const current: SymbolMap | null =
    maps.find((m) => m.symbol === (symbol ?? maps[0]?.symbol)) ?? maps[0] ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !current) return;
    host.innerHTML = "";
    const chart = createChart(host, {
      autoSize: true,
      height: 380,
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
    chartRef.current = chart;

    // Price trace across all synced deal points (grey, thin — context)
    const trace = chart.addSeries(LineSeries, { color: "#475569", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const seen = new Set<number>();
    trace.setData(
      current.points
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    // One green/red connector per closed round-trip
    for (const seg of current.segments) {
      const s = chart.addSeries(LineSeries, {
        color: seg.win === null ? "#64748b" : seg.win ? "#22c55e" : "#ef4444",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        title: `#${seg.positionId}`,
      });
      s.setData([
        { time: seg.from.time as UTCTimestamp, value: seg.from.value },
        { time: seg.to.time as UTCTimestamp, value: seg.to.value },
      ]);
    }

    // Entry/exit arrows on the trace series
    createSeriesMarkers(
      trace,
      current.markers.map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: m.color,
        text: m.text,
        size: 1 as const,
      })),
    );

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [current]);

  if (maps.length === 0) {
    return (
      <div className="text-sm text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
        Trade map waits for synced deals — as soon as the EA reports them, entries/exits appear here.
      </div>
    );
  }

  const wins = current?.segments.filter((s) => s.win === true).length ?? 0;
  const losses = current?.segments.filter((s) => s.win === false).length ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-[var(--color-accent)]">Trade map</h3>
        <div className="flex gap-1">
          {maps.map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSymbol(m.symbol)}
              className={`px-2 py-0.5 text-xs rounded border transition ${current?.symbol === m.symbol ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}
            >
              {m.symbol}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--color-muted)]">
          {current?.segments.length ?? 0} round-trips · <span className="text-[var(--color-profit)]">{wins}W</span> / <span className="text-[var(--color-loss)]">{losses}L</span>
        </span>
      </div>
      <div ref={hostRef} className="rounded-lg overflow-hidden border border-[var(--color-border)]" />
      <p className="text-[11px] text-[var(--color-muted)]">
        ▲ entry · ▼ exit · connector green = profitable round-trip, red = losing (from synced deal profit).
        Price path is drawn from your own deal prices — external market candles for {current?.symbol ?? "this symbol"} need a paid feed on the free tier; nothing here is faked.
      </p>
    </div>
  );
}
