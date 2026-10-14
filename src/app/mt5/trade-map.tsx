"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  CandlestickSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { buildTradeMap, type MapDeal, type SymbolMap } from "@/lib/trade-map";
import {
  makeDrawing,
  normalizeChartData,
  drawingToSegments,
  DRAWING_COLORS,
  type Anchor,
  type Drawing,
  type DrawingType,
} from "@/lib/chart-drawings";

type Tool = "cursor" | DrawingType;
type SaveState = "idle" | "loading" | "saving" | "saved" | "error";
type Candle = { time: number; open: number; high: number; low: number; close: number };

/** Open position as synced by the terminal EA (floating P&L included). */
export interface MapPosition {
  ticket: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: string;
  openPrice: string;
  openAt: string;
  profit: string | null;
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "cursor", label: "⬙", hint: "cursor" },
  { id: "trendline", label: "╱", hint: "trendline — click 2 points" },
  { id: "ray", label: "↗", hint: "ray — click 2 points, extends past the second" },
  { id: "rect", label: "▭", hint: "rectangle — click 2 opposite corners" },
  { id: "hline", label: "—", hint: "horizontal line — click price" },
  { id: "vline", label: "│", hint: "vertical line — click time" },
];

const TWO_CLICK_TOOLS = new Set<Tool>(["trendline", "ray", "rect"]);

/**
 * Trade Map — synced MT5 deals on real market candles, TradingView-style:
 * ▲ BUY/SELL labels, ▼ EXIT ±pnl labels, green/red connectors, dashed
 * entry/exit levels — plus drawing tools (trendline / hline / vline) that
 * PERSIST server-side per account+symbol (/api/charts/layout), along with
 * the visible zoom/pan range, exactly like TradingView's saved layouts.
 */
export default function TradeMap({ deals, accountId, positions }: { deals: MapDeal[]; accountId?: string; positions?: MapPosition[] }) {
  // The parent polls every 5s and hands us a NEW deals array each time —
  // key on the SEMANTIC content so `maps`/`current` keep stable identity and
  // the chart isn't needlessly torn down + rebuilt (which would wipe open
  // position price lines drawn by the overlay effect).
  const mapsKey = JSON.stringify([
    deals.map((d) => [d.ticket, d.entry, d.profit, d.price, d.imported ? 1 : 0]),
    (positions ?? []).map((p) => [p.ticket, p.symbol, p.side]),
  ]);
  const maps = useMemo(() => {
    const fromDeals = buildTradeMap(deals);
    if (fromDeals.length > 0) return fromDeals;
    // No closed deals yet but an open position exists: still show a chart
    // (candles + open-position overlays) instead of an empty placeholder.
    const p = positions?.[0];
    return p
      ? [{ symbol: p.symbol, points: [], segments: [], markers: [] } as SymbolMap]
      : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsKey]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleSrc, setCandleSrc] = useState<{ label: string | null; proxyNote: string | null }>({ label: null, proxyNote: null });

  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pendingAnchorTime, setPendingAnchorTime] = useState<number | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const anchorSerRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const drawingSerRef = useRef<Map<string, ISeriesApi<"Line">[]>>(new Map());
  const candleRef = useRef<Candle[]>([]);
  // open-position overlay (MT5-mobile style): entry lines + arrows
  const posLinesRef = useRef<IPriceLine[]>([]);
  const posMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // live refs so chart event closures always see the latest UI state
  const toolRef = useRef<Tool>(tool);
  const pendingRef = useRef<Anchor | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const rangeRef = useRef<{ from: number; to: number } | null>(null);
  const pendingRangeRef = useRef<{ from: number; to: number } | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  const current: SymbolMap | null =
    maps.find((m) => m.symbol === (symbol ?? maps[0]?.symbol)) ?? maps[0] ?? null;

  /** Server persistence key for this chart (per account + symbol), like TV's layout per chart. */
  const layoutKey = accountId && current ? `mt5:${accountId}|${current.symbol}` : null;

  /** Account-level chart interaction — the last symbol you had selected (TV remembers this too). */
  const accountStateKey = accountId ? `mt5:${accountId}|__ACCOUNT__` : null;
  const symbolStateLoadedRef = useRef(false);
  useEffect(() => {
    if (!accountStateKey || maps.length === 0) return;
    const [scope, sym] = accountStateKey.split("|");
    let cancelled = false;
    fetch(`/api/charts/layout?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(sym)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { data: { state?: { lastSymbol?: string } } | null }) : { data: null }))
      .then(({ data }) => {
        if (cancelled) return;
        symbolStateLoadedRef.current = true;
        const last = data && typeof data === "object" ? data.state?.lastSymbol : null;
        if (last && maps.some((m) => m.symbol === last)) setSymbol(last);
      })
      .catch(() => { symbolStateLoadedRef.current = true; });
    return () => { cancelled = true; };
  }, [accountStateKey, maps]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistSelectedSymbol = useCallback(
    (sym: string) => {
      if (!accountStateKey || !symbolStateLoadedRef.current) return;
      const [scope, s] = accountStateKey.split("|");
      void fetch(`/api/charts/layout?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(s)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { state: { lastSymbol: sym } } }),
      }).catch(() => {});
    },
    [accountStateKey],
  );

  // ---------- persistence ----------
  const persistNow = useCallback(async () => {
    if (!layoutKey || loadedKeyRef.current !== layoutKey) return;
    const [scope, sym] = layoutKey.split("|");
    setSaveState("saving");
    try {
      const r = await fetch(`/api/charts/layout?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(sym)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { drawings: drawingsRef.current, state: { visibleRange: rangeRef.current ?? undefined } } }),
      });
      setSaveState(r.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [layoutKey]);

  const scheduleSave = useCallback(() => {
    if (!layoutKey || loadedKeyRef.current !== layoutKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persistNow(); }, 700);
  }, [layoutKey, persistNow]);

  /** Load saved drawings + interaction state for this chart on open/symbol switch. */
  useEffect(() => {
    if (!layoutKey) return;
    const [scope, sym] = layoutKey.split("|");
    loadedKeyRef.current = null;
    setDrawings([]);
    setSaveState("loading");
    let cancelled = false;
    fetch(`/api/charts/layout?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(sym)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { data: unknown }) : { data: null }))
      .then(({ data }) => {
        if (cancelled) return;
        const parsed = normalizeChartData(data);
        pendingRangeRef.current = parsed.state.visibleRange ?? null;
        rangeRef.current = parsed.state.visibleRange ?? null;
        setDrawings(parsed.drawings);
        loadedKeyRef.current = layoutKey;
        setSaveState(parsed.drawings.length ? "saved" : "idle");
        // chart may already exist — restore the saved zoom window now
        const vr = parsed.state.visibleRange;
        if (vr && chartRef.current) {
          try { chartRef.current.timeScale().setVisibleLogicalRange(vr as never); } catch { /* resets on next build */ }
        }
      })
      .catch(() => { if (!cancelled) setSaveState("error"); });
    return () => { cancelled = true; };
  }, [layoutKey]);

  /** Autosave drawings + zoom whenever they change (TV-style background save). */
  const scheduleSaveRef = useRef(scheduleSave);
  useEffect(() => { scheduleSaveRef.current = scheduleSave; }, [scheduleSave]);
  useEffect(() => { scheduleSaveRef.current(); }, [drawings]);

  /** Real market candles behind the trades (when a free real feed exists). */
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setCandles([]);
    setCandleSrc({ label: null, proxyNote: null });
    fetch(`/api/mt5/candles?symbol=${encodeURIComponent(current.symbol)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as { candles?: Candle[]; source?: string; proxyNote?: string | null };
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
    drawingSerRef.current.clear();
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
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    // Real market candles as the backdrop (when available)
    let candleSeries: ISeriesApi<"Candlestick"> | null = null;
    if (candles.length > 0) {
      candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#089981",
        downColor: "#f23645",
        wickUpColor: "#1f7a44",
        wickDownColor: "#8a2a2a",
        borderVisible: false,
        priceLineVisible: false,
      });
      candleSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
        })),
      );
    }
    candleRef.current = candles;

    // Price trace across all synced deal points (grey, thin — exact deal times)
    const trace = chart.addSeries(LineSeries, { color: "#94a3b8", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const seen = new Set<number>();
    trace.setData(
      current.points
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    anchorSerRef.current = candleSeries ?? trace;

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
      mk(seg.from.value, "rgba(100,116,139,0.8)", 1, true);
      mk(seg.to.value, "rgba(100,116,139,0.8)", 1, true);
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

    // open-position arrows attach to the price-anchored series (separate plugin)
    posLinesRef.current = [];
    posMarkersApiRef.current = anchorSerRef.current ? createSeriesMarkers(anchorSerRef.current, []) : null;

    // dev-only probe: ?tmdebug exposes series internals for Playwright/e2e
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tmdebug")) {
      (window as unknown as { __tm?: unknown }).__tm = { chart, anchor: anchorSerRef.current };
    }

    // ----- drawing tools: click-chart interactions -----
    const resolveAnchor = (x: number, y: number): Anchor | null => {
      const price = anchorSerRef.current?.coordinateToPrice(y);
      let time: number | null = null;
      const t = chart.timeScale().coordinateToTime(x);
      if (t !== null && t !== undefined) time = Number(t);
      if (time === null) {
        // fallback: nearest loaded candle bar (weekends/gaps produce whitespace)
        const logical = chart.timeScale().coordinateToLogical(x);
        const bars = candleRef.current;
        if (logical !== null && bars.length > 0) {
          const i = Math.max(0, Math.min(bars.length - 1, Math.round(Number(logical))));
          time = bars[i].time;
        }
      }
      if (time === null || price === null || price === undefined) return null;
      return { time, price: Number(price) };
    };

    // Raw pointer events instead of subscribeClick: the chart's own click
    // subscription swallows the second click inside its double-click window,
    // which kills fast two-anchor trendline drawing. Movement >4px = pan, ignored.
    let downPos: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { downPos = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
      downPos = null;
      if (moved > 4) return;
      const active = toolRef.current;
      if (active === "cursor") return;
      const rect = host.getBoundingClientRect();
      const anchor = resolveAnchor(e.clientX - rect.left, e.clientY - rect.top);
      if (!anchor) return;
      if (active === "hline" || active === "vline") {
        const d = makeDrawing(active, [anchor]);
        if (d) setDrawings((prev) => [...prev, d]);
        setTool("cursor");
        return;
      }
      // two-click tools: trendline / ray / rectangle
      if (!TWO_CLICK_TOOLS.has(active)) return;
      if (!pendingRef.current) {
        pendingRef.current = anchor;
        setPendingAnchorTime(anchor.time);
        return;
      }
      const d = makeDrawing(active as "trendline" | "ray" | "rect", [pendingRef.current, anchor]);
      pendingRef.current = null;
      setPendingAnchorTime(null);
      if (d) setDrawings((prev) => [...prev, d]);
      setTool("cursor");
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointerup", onUp);

    // ----- persist the visible zoom/pan window (interaction state) -----
    let rangeTimer: ReturnType<typeof setTimeout> | null = null;
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (!r) return;
      rangeRef.current = { from: Number(r.from), to: Number(r.to) };
      if (rangeTimer) clearTimeout(rangeTimer);
      rangeTimer = setTimeout(() => scheduleSaveRef.current(), 800);
    });

    chart.timeScale().fitContent();
    // saved zoom window wins over fitContent when present
    const saved = pendingRangeRef.current;
    if (saved) {
      pendingRangeRef.current = null;
      try { chart.timeScale().setVisibleLogicalRange(saved as never); rangeRef.current = saved; } catch { /* first paint */ }
    }
    return () => {
      if (rangeTimer) clearTimeout(rangeTimer);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      chart.remove();
      chartRef.current = null;
      anchorSerRef.current = null;
      drawingSerRef.current.clear();
      posLinesRef.current = [];
      posMarkersApiRef.current = null;
    };
  }, [current, candles]);

  // ----- open-position overlay: entry arrows + dashed entry lines (MT5 style) -----
  // Runs outside the chart-build effect so 5s position polling updates the
  // floating P&L labels WITHOUT rebuilding the whole chart.
  const positionsKey = JSON.stringify(
    (positions ?? []).filter((p) => p.symbol === current?.symbol)
      .map((p) => [p.ticket, p.side, p.volume, p.openPrice, p.openAt, p.profit]),
  );
  useEffect(() => {
    const anchor = anchorSerRef.current;
    if (!anchor) return;
    for (const pl of posLinesRef.current) { try { anchor.removePriceLine(pl); } catch { /* gone */ } }
    posLinesRef.current = [];
    posMarkersApiRef.current?.setMarkers([]);

    const mine = (positions ?? []).filter((p) => p.symbol === current?.symbol);
    if (mine.length === 0 || !current) return;

    const bars = candleRef.current;
    /** bar whose open covers t; markers outside loaded data are skipped honestly */
    const barOf = (t: number): number | null => {
      let hit: number | null = null;
      for (const b of bars) { if (b.time <= t) hit = b.time; else break; }
      return hit;
    };

    const markers: {
      time: UTCTimestamp;
      position: "belowBar" | "aboveBar";
      shape: "arrowUp" | "arrowDown";
      color: string;
      text: string;
      size: 1;
    }[] = [];

    for (const p of mine) {
      const isBuy = p.side === "BUY";
      const color = isBuy ? "#2196f3" : "#f23645";
      const open = Number(p.openPrice);
      if (!Number.isFinite(open) || open <= 0) continue;
      const pnl = p.profit === null ? "" : ` · ${Number(p.profit) >= 0 ? "+" : ""}${Number(p.profit).toFixed(2)}`;
      try {
        posLinesRef.current.push(
          anchor.createPriceLine({
            price: open,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${p.side} ${Number(p.volume).toFixed(2)}${pnl}`,
          }),
        );
      } catch { /* scale not ready — line skipped, retried on next render */ }

      const t = barOf(Math.floor(new Date(p.openAt).getTime() / 1000));
      if (t !== null) {
        markers.push({
          time: t as UTCTimestamp,
          position: isBuy ? "belowBar" : "aboveBar",
          shape: isBuy ? "arrowUp" : "arrowDown",
          color,
          text: `${p.side} ${Number(p.volume).toFixed(2)}`,
          size: 1,
        });
      }
    }
    markers.sort((a, b) => Number(a.time) - Number(b.time));
    posMarkersApiRef.current?.setMarkers(markers);

    // dev-only probe (?tmdebug): report what the overlay effect actually did
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tmdebug")) {
      (window as unknown as { __tmPos?: unknown }).__tmPos = {
        mine: mine.length,
        lines: posLinesRef.current.length,
        markers: markers.length,
        firstLineOpts: posLinesRef.current[0] ? posLinesRef.current[0].options() : null,
      };
    }
  }, [positionsKey, current, candles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- (re)render drawing series whenever drawings or the chart change -----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const series of drawingSerRef.current.values()) series.forEach((s) => { try { chart.removeSeries(s); } catch { /* gone */ } });
    drawingSerRef.current.clear();
    const bars = candleRef.current;
    const fallback = current?.points ?? [];
    const times = bars.length ? bars.map((b) => b.time) : fallback.map((p) => p.time);
    const lows = bars.length ? bars.map((b) => b.low) : fallback.map((p) => p.value);
    const highs = bars.length ? bars.map((b) => b.high) : fallback.map((p) => p.value);
    if (times.length === 0) return;
    const wb = {
      minTime: Math.min(...times), maxTime: Math.max(...times),
      minPrice: Math.min(...lows), maxPrice: Math.max(...highs),
    };
    for (const d of drawings) {
      const series: ISeriesApi<"Line">[] = [];
      for (const seg of drawingToSegments(d, wb)) {
        const s = chart.addSeries(LineSeries, {
          color: d.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData([
          { time: seg.from.time as UTCTimestamp, value: seg.from.price },
          { time: seg.to.time as UTCTimestamp, value: seg.to.price },
        ]);
        series.push(s);
      }
      drawingSerRef.current.set(d.id, series);
    }
  }, [drawings, current, candles]);

  if (maps.length === 0) {
    return (
      <div className="text-sm text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
        Trade map waits for synced deals — as soon as the EA reports them, entries/exits appear here.
      </div>
    );
  }

  const wins = current?.segments.filter((s) => s.win === true).length ?? 0;
  const losses = current?.segments.filter((s) => s.win === false).length ?? 0;
  const removeDrawing = (id: string) => setDrawings((prev) => prev.filter((d) => d.id !== id));
  const clearAll = () => {
    setDrawings([]);
    if (!layoutKey) return;
    const [scope, sym] = layoutKey.split("|");
    void fetch(`/api/charts/layout?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(sym)}`, { method: "DELETE" }).catch(() => {});
  };
  const drawingLabel = (d: Drawing) => {
    if (d.type === "trendline") return `trendline @ ${d.anchors[0].price.toFixed(2)}`;
    if (d.type === "ray") return `ray from ${d.anchors[0].price.toFixed(2)}`;
    if (d.type === "rect") {
      const lo = Math.min(d.anchors[0].price, d.anchors[1].price).toFixed(2);
      const hi = Math.max(d.anchors[0].price, d.anchors[1].price).toFixed(2);
      return `rect ${lo}–${hi}`;
    }
    if (d.type === "hline") return `hline ${d.anchors[0].price.toFixed(2)}`;
    return `vline ${new Date(d.anchors[0].time * 1000).toISOString().slice(0, 10)}`;
  };
  const saveText =
    saveState === "loading" ? "loading saved drawings…" :
    saveState === "saving" ? "saving…" :
    saveState === "saved" ? "saved ✓" :
    saveState === "error" ? "save failed" : "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-[var(--color-accent)]">Trade map</h3>
        <div className="flex gap-1">
          {maps.map((m) => (
            <button
              key={m.symbol}
              onClick={() => { setSymbol(m.symbol); persistSelectedSymbol(m.symbol); }}
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

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mr-1">draw</span>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.hint}
            onClick={() => { setTool(t.id); pendingRef.current = null; setPendingAnchorTime(null); }}
            className={`w-7 h-7 rounded border font-bold transition ${tool === t.id ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}
          >
            {t.label}
          </button>
        ))}
        {TWO_CLICK_TOOLS.has(tool) && pendingAnchorTime !== null && (
          <span className="text-[var(--color-accent)]">first anchor set — click the second point</span>
        )}
        {tool !== "cursor" && !(TWO_CLICK_TOOLS.has(tool) && pendingAnchorTime !== null) && (
          <span className="text-[var(--color-muted)]">click on chart…</span>
        )}
        <span className="ml-auto flex items-center gap-2 min-w-[120px] justify-end">
          {saveText && <span className={`text-[10px] ${saveState === "error" ? "text-[var(--color-loss)]" : "text-[var(--color-muted)]"}`}>{saveText}</span>}
          {drawings.length > 0 && (
            <button onClick={clearAll} className="text-[10px] text-[var(--color-loss)] underline">clear all</button>
          )}
        </span>
      </div>

      <div ref={hostRef} className={`rounded-lg overflow-hidden border ${tool !== "cursor" ? "border-[var(--color-accent)]/60" : "border-[var(--color-border)]"} cursor-${tool === "cursor" ? "default" : "crosshair"}`} />
      <div className="flex flex-wrap gap-1.5 min-h-[22px]" aria-label="drawings">
        {drawings.map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: d.color }} />
            {drawingLabel(d)}
            <button onClick={() => removeDrawing(d.id)} className="text-[var(--color-loss)] hover:font-bold" title="delete drawing">×</button>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-muted)]">
        ▲ entry (side + volume) · ▼ exit (result) · green/red connector = profitable/losing round-trip.
        Dashed blue/red line + arrow = <b>open position</b> (floating P&L, straight from your terminal).
        Drawings and your zoom level are saved to your account automatically (TradingView-style).
        {candleSrc.label
          ? <> Candles: {candleSrc.label}{candleSrc.proxyNote ? ` (${candleSrc.proxyNote})` : ""}.</>
          : <> Price path is drawn from your own deal prices — external market candles for {current?.symbol ?? "this symbol"} need a paid feed on the free tier; nothing here is faked.</>}
      </p>
    </div>
  );
}
