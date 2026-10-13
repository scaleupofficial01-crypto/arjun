"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  readMyChartState,
  mergeIntoLayoutData,
  nextColor,
  makeId,
  type Anchor,
  type Drawing,
} from "@/lib/chart-drawings";

type Tool = "select" | "trend" | "ray" | "hline";
type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * My Saved Chart — the account-synced drawing board.
 * Real candles (Coinbase, daily) + your own trendline/ray/horizontal tools.
 * Every drawing is anchored in (time, price), saved server-side per
 * user+symbol with debounced autosave, and restored on any device —
 * the behavior the free TradingView embed cannot provide cross-device.
 */
export default function SavedChart({ symbol }: { symbol: string }) {
  const [tool, setTool] = useState<Tool>("select");
  const [count, setCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const pendingRef = useRef<Anchor | null>(null);
  const hoverRef = useRef<Anchor | null>(null);
  const otherKeysRef = useRef<Record<string, unknown>>({});
  const toolRef = useRef<Tool>("select");
  const selectedRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);
  toolRef.current = tool;
  selectedRef.current = selectedId;

  const setDrawings = useCallback((next: Drawing[]) => {
    drawingsRef.current = next;
    setCount(next.length);
  }, []);

  /** Persist (debounced, merge-safe) to the server. */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      const data = mergeIntoLayoutData(otherKeysRef.current, {
        v: 1,
        drawings: drawingsRef.current,
      });
      try {
        const res = await fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!res.ok) throw new Error(String(res.status));
        otherKeysRef.current = mergeIntoLayoutData(otherKeysRef.current, {
          v: 1,
          drawings: drawingsRef.current,
        });
        setSaveState("saved");
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch {
        setSaveState("error");
      }
    }, 800);
  }, [symbol]);

  const addDrawing = useCallback(
    (d: Drawing) => {
      setDrawings([...drawingsRef.current, d]);
      scheduleSave();
    },
    [setDrawings, scheduleSave],
  );

  /** Chart + data bootstrap (per symbol). */
  useEffect(() => {
    const host = hostRef.current;
    const canvas = overlayRef.current;
    if (!host || !canvas) return;
    let disposed = false;

    setLoading(true);
    setError(null);
    setSelectedId(null);
    pendingRef.current = null;

    const chart = createChart(host, {
      autoSize: true,
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
      crosshair: { vertLine: { labelVisible: false } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const handleClick = (param: MouseEventParams<Time>) => {
      if (toolRef.current !== "select" || !param.point) return;
      const hit = hitTest(param.point.x, param.point.y);
      setSelectedId(hit);
    };
    chart.subscribeClick(handleClick);

    void (async () => {
      try {
        const [cRes, lRes] = await Promise.all([
          fetch(`/api/charts/candles?symbol=${encodeURIComponent(symbol)}&tf=1D`),
          fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`),
        ]);
        if (disposed) return;
        const cJson = (await cRes.json()) as {
          candles?: { time: number; open: number; high: number; low: number; close: number }[];
          message?: string;
        };
        if (!cRes.ok || !cJson.candles) {
          setError(cJson.message ?? "Could not load candles");
          setLoading(false);
          return;
        }
        series.setData(
          cJson.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        chart.timeScale().fitContent();

        if (lRes.ok) {
          const lJson = (await lRes.json()) as { data: unknown };
          const state = readMyChartState(lJson.data);
          const rest =
            lJson.data && typeof lJson.data === "object" && !Array.isArray(lJson.data)
              ? ({ ...(lJson.data as Record<string, unknown>) } as Record<string, unknown>)
              : {};
          delete rest.mychart;
          otherKeysRef.current = rest;
          setDrawings(state.drawings);
        } else {
          otherKeysRef.current = {};
          setDrawings([]);
        }
        setLoading(false);
      } catch {
        if (!disposed) {
          setError("Could not reach the server for candles/layout");
          setLoading(false);
        }
      }
    })();

    /** redraw loop (keeps overlay aligned with pan/zoom). */
    const render = () => {
      if (disposed) return;
      draw();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      chart.unsubscribeClick(handleClick);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const toXY = useCallback((a: Anchor): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(a.t as UTCTimestamp);
    const y = series.priceToCoordinate(a.p);
    if (x === null || y === null) return null;
    return { x: Number(x), y: Number(y) };
  }, []);

  const toAnchor = useCallback((clientX: number, clientY: number): Anchor | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = overlayRef.current;
    if (!chart || !series || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const t = chart.timeScale().coordinateToTime(clientX - rect.left);
    const p = series.coordinateToPrice(clientY - rect.top);
    if (t === null || p === null) return null;
    return { t: Number(t), p: Number(p) };
  }, []);

  const draw = useCallback(() => {
    const canvas = overlayRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.6;

    const line = (a: Anchor, b: Anchor | undefined, d: Drawing) => {
      if (d.type === "hline") {
        // A horizontal level is time-agnostic: price→y only (TV-consistent).
        const series = seriesRef.current;
        if (!series) return;
        const y = series.priceToCoordinate(d.a.p);
        if (y === null) return;
        ctx.strokeStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(0, Number(y));
        ctx.lineTo(w, Number(y));
        ctx.stroke();
        label(` ${d.a.p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 6, Number(y) - 5, d.color);
        handles([{ x: w / 2, y: Number(y) }], d);
        return;
      }
      if (!b) return;
      const pa = toXY(a);
      const pb = toXY(b);
      if (!pa || !pb) return;
      ctx.strokeStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      if (d.type === "ray") {
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        if (dx !== 0 || dy !== 0) {
          const scale = (Math.max(w, h) * 2) / Math.hypot(dx, dy);
          ctx.lineTo(pb.x + dx * scale, pb.y + dy * scale);
        }
      }
      ctx.stroke();
      handles([pa, pb], d);
    };

    const handles = (pts: { x: number; y: number }[], d: Drawing) => {
      if (selectedRef.current !== d.id) return;
      ctx.fillStyle = "#ffffff";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const label = (text: string, x: number, y: number, color: string) => {
      ctx.font = "11px system-ui";
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };

    for (const d of drawingsRef.current) line(d.a, d.b, d);

    // in-progress preview
    const pending = pendingRef.current;
    const hover = hoverRef.current;
    if (pending && hover) {
      const pa = toXY(pending);
      const pb = toXY(hover);
      if (pa && pb) {
        ctx.strokeStyle = "#f59e0b";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [toXY]);

  const hitTest = useCallback(
    (x: number, y: number): string | null => {
      const canvas = overlayRef.current;
      if (!canvas) return null;
      const w = canvas.width;
      let best: { id: string; dist: number } | null = null;
      for (const d of drawingsRef.current) {
        let dist = Infinity;
        if (d.type === "hline") {
          const p = toXY(d.a);
          if (p) dist = Math.abs(p.y - y);
        } else if (d.b) {
          const pa = toXY(d.a);
          const pb = toXY(d.b);
          if (pa && pb) {
            // point-to-segment distance (clip rays to the visible window)
            const clip = (pt: { x: number; y: number }) => ({
              x: Math.min(Math.max(pt.x, -w), w * 2),
              y: Math.min(Math.max(pt.y, -w), w * 2),
            });
            const A = clip(pa);
            const B = clip(pb);
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const len2 = dx * dx + dy * dy || 1;
            let t = ((x - A.x) * dx + (y - A.y) * dy) / len2;
            if (d.type === "trend") t = Math.max(0, Math.min(1, t));
            else t = Math.max(0, t);
            const px = A.x + t * dx;
            const py = A.y + t * dy;
            dist = Math.hypot(x - px, y - py);
          }
        }
        if (dist < 8 && (best === null || dist < best.dist)) best = { id: d.id, dist };
      }
      return best ? (best as { id: string }).id : null;
    },
    [toXY],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const a = toAnchor(e.clientX, e.clientY);
      if (!a) return;
      const toolNow = toolRef.current;
      if (toolNow === "select") return; // handled via subscribeClick
      if (toolNow === "hline") {
        addDrawing({
          id: makeId(),
          type: "hline",
          a,
          color: nextColor(drawingsRef.current),
          createdAt: new Date().toISOString(),
        });
        return;
      }
      // trend / ray: two clicks
      if (!pendingRef.current) {
        pendingRef.current = a;
      } else {
        addDrawing({
          id: makeId(),
          type: toolNow,
          a: pendingRef.current,
          b: a,
          color: nextColor(drawingsRef.current),
          createdAt: new Date().toISOString(),
        });
        pendingRef.current = null;
      }
    },
    [toAnchor, addDrawing],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      hoverRef.current = toAnchor(e.clientX, e.clientY);
    },
    [toAnchor],
  );

  /** Esc cancels an in-progress drawing; Delete removes the selected one. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pendingRef.current = null;
        setSelectedId(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) {
        setDrawings(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
        setSelectedId(null);
        scheduleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDrawings, scheduleSave]);

  const undoLast = useCallback(() => {
    setDrawings(drawingsRef.current.slice(0, -1));
    scheduleSave();
  }, [setDrawings, scheduleSave]);

  const deleteAll = useCallback(async () => {
    setDrawings([]);
    setSelectedId(null);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    } catch {
      /* delete of empty layout 404s — fine */
    }
    otherKeysRef.current = {};
    setSaveState("saved");
    setLastSavedAt(new Date().toLocaleTimeString());
  }, [symbol]);

  const toolBtn = (t: Tool, label: string, title: string) => (
    <button
      key={t}
      title={title}
      onClick={() => {
        setTool(t);
        pendingRef.current = null;
      }}
      className={`px-2.5 py-1 text-xs rounded-lg border transition ${
        tool === t
          ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
          : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">My Saved Chart — {symbol}</h2>
        <span className="badge badge-live">synced to your account</span>
        <span className="text-xs text-[var(--color-muted)]">daily candles · Coinbase live</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {saveState === "saving" && <span className="text-[var(--color-muted)]">saving…</span>}
          {saveState === "saved" && (
            <span className="text-[var(--color-profit)]">✓ saved{lastSavedAt ? ` · ${lastSavedAt}` : ""}</span>
          )}
          {saveState === "error" && <span className="text-[var(--color-loss)]">save failed — will retry on next edit</span>}
          {count > 0 && <span className="text-[var(--color-muted)]">{count} drawing{count === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {toolBtn("select", "↖ Select", "Pan/zoom the chart; click a drawing to select it")}
        {toolBtn("trend", "📈 Trendline", "Click two points to draw a trendline")}
        {toolBtn("ray", "➶ Ray", "Two points — extends infinitely")}
        {toolBtn("hline", "― H-Line", "One click — horizontal level")}
        <span className="text-[var(--color-border)]">|</span>
        <button onClick={undoLast} disabled={count === 0} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white disabled:opacity-40">
          ↩ Undo last
        </button>
        {selectedId && (
          <button
            onClick={() => {
              setDrawings(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
              setSelectedId(null);
              scheduleSave();
            }}
            className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)]"
          >
            ✕ Delete selected
          </button>
        )}
        {count > 0 && (
          <button onClick={deleteAll} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)]">
            Delete all
          </button>
        )}
      </div>

      <div
        ref={hostRef}
        className="relative rounded-lg overflow-hidden"
        style={{ height: "calc(100vh - 460px)", minHeight: 420 }}
      >
        <canvas
          ref={overlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className="absolute inset-0 z-10"
          style={{
            pointerEvents: tool === "select" ? "none" : "auto",
            cursor: tool === "select" ? "default" : "crosshair",
          }}
        />
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-[var(--color-muted)] bg-[var(--color-panel)]/60">
            loading candles…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-amber-400 bg-[var(--color-panel)]/80 text-center px-8">
            {error}
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Pick a tool → click on the chart. Every change autosaves to your account (per symbol) —
        open on any device and your drawings are back. Delete removes them for good.
      </p>
    </div>
  );
}
