/**
 * Chart drawing tools model — pure + unit-tested (no DOM, no chart lib).
 *
 * One shape for all persisted chart state ("ChartData"), stored server-side
 * via /api/charts/layout so drawings + interactions survive refresh, just
 * like TradingView's saved layouts. Renderers (lightweight-charts etc.)
 * translate these into their own primitives via the helpers below.
 *
 * Units: `time` = unix seconds (UTC), `price` = number.
 */

export type DrawingType = "trendline" | "hline" | "vline" | "rect" | "ray";

export interface Anchor {
  time: number; // unix seconds
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  /** trendline/rect/ray: exactly 2 anchors; hline/vline: exactly 1. */
  anchors: Anchor[];
  color: string;
}

/** Non-drawing interaction state worth persisting (TradingView keeps these too). */
export interface ChartState {
  /** last zoom/pan window the user looked at (lightweight-charts logical range). */
  visibleRange?: { from: number; to: number };
}

export interface ChartData {
  drawings: Drawing[];
  state: ChartState;
}

export const DRAWING_COLORS = ["#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"] as const;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_DRAWINGS = 200;

export function newDrawingId(): string {
  return `drw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function toAnchor(v: unknown): Anchor | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const time = Number(a.time);
  const price = Number(a.price);
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return { time, price };
}

export function makeDrawing(type: DrawingType, anchors: Anchor[], color: string = DRAWING_COLORS[0]): Drawing | null {
  const need = type === "hline" || type === "vline" ? 1 : 2;
  if (!Array.isArray(anchors) || anchors.length !== need) return null;
  const clean = anchors.map(toAnchor);
  if (clean.some((a) => a === null)) return null;
  return {
    id: newDrawingId(),
    type,
    anchors: clean as Anchor[],
    color: HEX_RE.test(color) ? color : DRAWING_COLORS[0],
  };
}

/**
 * Parse + sanitize whatever is in the database payload into ChartData.
 * Never throws; unknown/junk entries are dropped instead of crashing the chart.
 */
export function normalizeChartData(src: unknown): ChartData {
  const out: ChartData = { drawings: [], state: {} };
  if (!src || typeof src !== "object") return out;
  const obj = src as Record<string, unknown>;
  if (Array.isArray(obj.drawings)) {
    for (const raw of obj.drawings) {
      if (out.drawings.length >= MAX_DRAWINGS) break;
      if (!raw || typeof raw !== "object") continue;
      const d = raw as Record<string, unknown>;
      const type = d.type;
      if (type !== "trendline" && type !== "hline" && type !== "vline" && type !== "rect" && type !== "ray") continue;
      const anchors = Array.isArray(d.anchors) ? d.anchors.map(toAnchor).filter((a) => a !== null) : [];
      const need = type === "hline" || type === "vline" ? 1 : 2;
      if (anchors.length !== need) continue;
      out.drawings.push({
        id: typeof d.id === "string" && d.id.length >= 4 && d.id.length <= 64 ? d.id : newDrawingId(),
        type,
        anchors: anchors as Anchor[],
        color: typeof d.color === "string" && HEX_RE.test(d.color) ? d.color : DRAWING_COLORS[0],
      });
    }
  }
  const st = obj.state;
  if (st && typeof st === "object") {
    const vr = (st as Record<string, unknown>).visibleRange;
    if (vr && typeof vr === "object") {
      const from = Number((vr as Record<string, unknown>).from);
      const to = Number((vr as Record<string, unknown>).to);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        out.state.visibleRange = { from, to };
      }
    }
  }
  return out;
}

export interface LineBars {
  /** first/last bar time (unix seconds) of the loaded candle window. */
  minTime: number;
  maxTime: number;
  minPrice: number; // lowest low of the window
  maxPrice: number; // highest high of the window
}

/**
 * Expand a drawing into minimal render segments (start→end) for a line-based
 * chart renderer. Horizontal/vertical lines are stretched ~60 days past the
 * candle window so they behave like TradingView's extended lines while panning.
 */
export function drawingToSegments(d: Drawing, bars: LineBars): Array<{ from: Anchor; to: Anchor }> {
  const PAD = 60 * 86400;
  if (d.type === "trendline") {
    const [a, b] = d.anchors;
    return a.time <= b.time ? [{ from: a, to: b }] : [{ from: b, to: a }];
  }
  if (d.type === "hline") {
    const p = d.anchors[0];
    return [{ from: { time: bars.minTime - PAD, price: p.price }, to: { time: bars.maxTime + PAD, price: p.price } }];
  }
  if (d.type === "rect") {
    const [a, b] = d.anchors;
    const t1 = Math.min(a.time, b.time), t2 = Math.max(a.time, b.time);
    const p1 = Math.min(a.price, b.price), p2 = Math.max(a.price, b.price);
    return [
      { from: { time: t1, price: p1 }, to: { time: t2, price: p1 } }, // bottom
      { from: { time: t1, price: p2 }, to: { time: t2, price: p2 } }, // top
      { from: { time: t1, price: p1 }, to: { time: t1 + 60, price: p2 } }, // left
      { from: { time: t2, price: p1 }, to: { time: t2 + 60, price: p2 } }, // right
    ];
  }
  if (d.type === "ray") {
    const [a, b] = d.anchors;
    const lo = bars.minPrice - (bars.maxPrice - bars.minPrice) * 0.2;
    const hi = bars.maxPrice + (bars.maxPrice - bars.minPrice) * 0.2;
    if (a.time === b.time) {
      // degenerate vertical ray → spans the price window (like a vline)
      return [{ from: { time: a.time, price: lo }, to: { time: a.time + 60, price: hi } }];
    }
    const m = (b.price - a.price) / (b.time - a.time);
    // ray starts at the first-clicked anchor and extends past the second one
    const extendTo = b.time > a.time ? bars.maxTime + PAD : bars.minTime - PAD;
    const t1 = Math.min(a.time, extendTo), t2 = Math.max(a.time, extendTo);
    return [
      { from: { time: t1, price: a.price + m * (t1 - a.time) }, to: { time: t2, price: a.price + m * (t2 - a.time) } },
    ];
  }
  const t = d.anchors[0].time;
  const lo = bars.minPrice - (bars.maxPrice - bars.minPrice) * 0.2;
  const hi = bars.maxPrice + (bars.maxPrice - bars.minPrice) * 0.2;
  // two timestamps 60s apart so renderers that require strictly increasing time stay happy
  return [{ from: { time: t, price: lo }, to: { time: t + 60, price: hi } }];
}
