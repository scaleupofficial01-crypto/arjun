import { z } from "zod";
import { computePnl } from "./pnl";

/** CSV columns for import/export (also used for xlsx). */
export const TRADE_CSV_COLUMNS = [
  "symbol",
  "side",
  "entryPrice",
  "exitPrice",
  "quantity",
  "risk",
  "fees",
  "entryAt",
  "exitAt",
  "setupTag",
  "notes",
] as const;

export interface TradeRow {
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: string;
  exitPrice: string | null;
  quantity: string;
  risk: string | null;
  fees: string;
  entryAt: Date;
  exitAt: Date | null;
  setupTag: string | null;
  notes: string | null;
  status: "OPEN" | "CLOSED";
  pnl: string | null;
}

const num = z.string().regex(/^\d+(\.\d+)?$/, "must be a positive number");
const rowSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  entryPrice: num,
  exitPrice: num.nullable().optional(),
  quantity: num,
  risk: num.nullable().optional(),
  fees: num.nullable().optional(),
  entryAt: z.string().nullable().optional(),
  exitAt: z.string().nullable().optional(),
  setupTag: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Parse one incoming row. pnl is RECOMPUTED from prices — never trusted
 * from the file (real math rule applies to imports too).
 */
export function parseTradeRow(raw: Record<string, unknown>): TradeRow | { error: string } {
  const norm: Record<string, unknown> = {};
  for (const key of TRADE_CSV_COLUMNS) {
    const v = raw[key];
    norm[key] = v === undefined || v === "" ? null : String(v).trim();
  }
  const parsed = rowSchema.safeParse(norm);
  if (!parsed.success) {
    return { error: `invalid row: ${parsed.error.issues[0]?.message ?? "format"}` };
  }
  const d = parsed.data;
  const entryAt = toDate(d.entryAt) ?? new Date();
  const exitAt = toDate(d.exitAt);
  const hasExit = Boolean(d.exitPrice);
  const pnl = hasExit
    ? computePnl({
        side: d.side,
        entryPrice: d.entryPrice,
        exitPrice: d.exitPrice,
        quantity: d.quantity,
        fees: d.fees,
      })
    : null;
  return {
    symbol: d.symbol.toUpperCase(),
    side: d.side,
    entryPrice: d.entryPrice,
    exitPrice: d.exitPrice ?? null,
    quantity: d.quantity,
    risk: d.risk ?? null,
    fees: d.fees ?? "0",
    entryAt,
    exitAt: hasExit ? (exitAt ?? new Date()) : null,
    setupTag: d.setupTag ?? null,
    notes: d.notes ?? null,
    status: hasExit ? "CLOSED" : "OPEN",
    pnl,
  };
}

function esc(v: string | null): string {
  if (v === null || v === "") return "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function tradesToCsv(rows: (TradeRow & { group?: string | null })[]): string {
  const header = [...TRADE_CSV_COLUMNS, "group", "pnl"].join(",");
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.side,
      r.entryPrice,
      r.exitPrice ?? "",
      r.quantity,
      r.risk ?? "",
      r.fees,
      r.entryAt instanceof Date ? r.entryAt.toISOString() : String(r.entryAt),
      r.exitAt ? (r.exitAt instanceof Date ? r.exitAt.toISOString() : String(r.exitAt)) : "",
      esc(r.setupTag),
      esc(r.notes),
      esc(r.group ?? null),
      r.pnl ?? "",
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

/** Minimal RFC-4180 CSV parser (handles quoted fields). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") continue;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
}
