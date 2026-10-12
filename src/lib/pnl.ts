import Decimal from "decimal.js";

export interface PnlInput {
  side: "BUY" | "SELL";
  entryPrice: string | number;
  exitPrice: string | number | null | undefined;
  quantity: string | number;
  fees?: string | number | null;
}

/**
 * Real P&L math — computed from stored records only (§3 journal: no
 * fabricated numbers). Decimal arithmetic, never float math on money.
 * LONG: (exit-entry)*qty - fees. SHORT: (entry-exit)*qty - fees.
 * Returns null for open trades (no exit price).
 */
export function computePnl(t: PnlInput): string | null {
  if (t.exitPrice === null || t.exitPrice === undefined) return null;
  const entry = new Decimal(t.entryPrice);
  const exit = new Decimal(t.exitPrice);
  const qty = new Decimal(t.quantity);
  const fees = new Decimal(t.fees ?? 0);
  const diff = t.side === "BUY" ? exit.minus(entry) : entry.minus(exit);
  return diff.times(qty).minus(fees).toFixed(8);
}

/** R multiple: pnl / risk (null when no risk or open trade). */
export function rMultiple(pnl: string | null, risk: string | number | null | undefined): string | null {
  if (pnl === null || risk === null || risk === undefined) return null;
  const r = new Decimal(risk);
  if (r.isZero()) return null;
  return new Decimal(pnl).div(r).toFixed(4);
}
