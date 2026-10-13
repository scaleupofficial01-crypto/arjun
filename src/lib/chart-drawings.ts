/**
 * Saved-chart drawings model — pure helpers (unit-tested).
 *
 * Drawings are stored server-side per user+symbol inside the existing
 * ChartLayout.data JSON under the `mychart` key, so they merge safely with
 * any other chart state stored alongside. Anchors are logical
 * (unix seconds, price), never pixels, so a drawing survives pan/zoom and
 * comes back identically on any device.
 */

export type DrawingType = "trend" | "hline" | "ray";

export interface Anchor {
  /** unix seconds (UTC) */
  t: number;
  p: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  a: Anchor;
  b?: Anchor;
  color: string;
  createdAt: string;
}

export interface MyChartState {
  v: 1;
  drawings: Drawing[];
}

export const EMPTY_STATE: MyChartState = { v: 1, drawings: [] };

export const DRAWING_COLORS = ["#f59e0b", "#22c55e", "#ef4444", "#38bdf8", "#e879f9"] as const;

/** Read the mychart state out of a ChartLayout.data blob (unknown shape tolerated). */
export function readMyChartState(data: unknown): MyChartState {
  if (!data || typeof data !== "object") return EMPTY_STATE;
  const raw = (data as Record<string, unknown>).mychart;
  if (!raw || typeof raw !== "object") return EMPTY_STATE;
  const list = (raw as Record<string, unknown>).drawings;
  if (!Array.isArray(list)) return EMPTY_STATE;
  const drawings = list
    .map((d) => normalizeDrawing(d))
    .filter((d): d is Drawing => d !== null)
    .slice(0, 500);
  return { v: 1, drawings };
}

function normalizeDrawing(d: unknown): Drawing | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const type = o.type;
  if (type !== "trend" && type !== "hline" && type !== "ray") return null;
  const a = normalizeAnchor(o.a);
  if (!a) return null;
  const bRaw = o.b === undefined ? undefined : normalizeAnchor(o.b);
  const b = bRaw ?? undefined;
  if ((type === "trend" || type === "ray") && !b) return null;
  return {
    id: typeof o.id === "string" && o.id.length > 0 && o.id.length <= 64 ? o.id : makeId(),
    type,
    a,
    b,
    color:
      typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color)
        ? o.color
        : DRAWING_COLORS[0],
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString(),
  };
}

function normalizeAnchor(x: unknown): Anchor | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const t = Number(o.t);
  const p = Number(o.p);
  if (!Number.isFinite(t) || !Number.isFinite(p)) return null;
  if (t < 0 || t > 4_102_444_800) return null; // before 1970 or after year 2100
  if (Math.abs(p) > 1e12) return null;
  return { t, p };
}

export function makeId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Merge mychart state into an existing layout blob without clobbering other keys. */
export function mergeIntoLayoutData(existing: unknown, state: MyChartState): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base.mychart = { v: 1, drawings: state.drawings };
  return base;
}

export function nextColor(existing: Drawing[]): string {
  return DRAWING_COLORS[existing.length % DRAWING_COLORS.length];
}
