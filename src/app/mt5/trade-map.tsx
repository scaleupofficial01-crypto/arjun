"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  CandlestickSeries,
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
  const [candles, setCandles] = useState<{ time: number; open: number; high: number; low: number; close: number }[]>([]);
  const [candleSrc, setCandleSrc] = useState<{ label: string | null; proxyNote: string | null }>({ label: null, proxyNote: null });
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const current: SymbolMap | null =
    maps.find((m) => m.symbol === (symbol ?? maps[0]?.symbol)) ?? maps[0] ?? null;

  /** Real market candles behind the trades (when a free real feed exists). */
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setCandles([]);
    setCandleSrc({ label: null, proxyNote: null });
    fetch(`/api/mt5/candles?symbol=${encodeURIComponent(current.symbol)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as { candles?: { time: number; open: number; high: number; low: number; close: number }[]; source?: string; proxyNote?: string | null };
        return d.candles ? d : null;
      })
      .then((d) => {
        if (cancelled || !d || !d.candles) return;
        setCandles(d.candles);
        setCandleSrc({ label: d.source ?? null, proxyNote: d.proxyNote ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Real market candles as the backdrop (when available)
    if (candles.length > 0) {
      const cs = chart.addSeries(CandlestickSeries, {
        upColor: "#089981",
        downColor: "#f23645",
        wickUpColor: "#1f7a44",
        wickDownColor: "#8a2a2a",
        borderVisible: false,
        priceLineVisible: false,
      });
      cs.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
        })),
      );
    }

    // Price trace across all synced deal points (grey, thin — exact deal times)
    const trace = chart.addSeries(LineSeries, { color: "#94a3b8", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const seen = new Set<number>();
    trace.setData(
      current.points
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    // TradingView-position style: dashed entry/exit level lines + solid win/loss connector
    for (const seg of current.segments) {
      const mk = (value: number, color: string, width: 1 | 2, dashed: boolean) => {
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: width,
          lineStyle: dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData([
          { time: seg.from.time as UTCTimestamp, value },
          { time: seg.to.time as UTCTimestamp, value },
        ]);
      };
      // dashed level at entry price and at exit price (TV's position overlay)
      mk(seg.from.value, "rgba(100,116,139,0.8)", 1, true);
      mk(seg.to.value, "rgba(100,116,139,0.8)", 1, true);
      // solid connector, green = win / red = loss
      const conn = chart.addSeries(LineSeries, {
        color: seg.win === null ? "#64748b" : seg.win ? "#22c55e" : "#ef4444",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        title: `#${seg.positionId}`,
        crosshairMarkerVisible: false,
      });
      conn.setData([
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
  }, [current, candles]);

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
        {candleSrc.label
          ? <> Candles: {candleSrc.label}{candleSrc.proxyNote ? ` (${candleSrc.proxyNote})` : ""}; markers sit on your own synced deal prices.</>
          : <> Price path is drawn from your own deal prices — external market candles for {current?.symbol ?? "this symbol"} need a paid feed on the free tier; nothing here is faked.</>}
      </p>
    </div>
  );
}
