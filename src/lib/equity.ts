import Decimal from "decimal.js";
import type { MapDeal } from "./trade-map";

/**
 * Equity curve model — realized P&L accumulated across synced MT5 deals.
 * Pure + unit-tested.
 *
 * Accounting matches how MT5 updates the balance: every deal contributes
 * (profit + commission + swap). Entry deals carry commission only; exit
 * deals carry the realized profit plus their commission/swap. The curve is
 * the terminal-reported truth — the journal still recomputes its own pnl
 * server-side from prices.
 *
 * Units: time = unix seconds (UTC), value = account currency.
 */

export interface EquityPoint {
  time: number;
  value: number; // cumulative net P&L after this deal
}

export interface EquityCurve {
  points: EquityPoint[]; // strictly increasing time, last = final equity
  net: number; // total realized P&L
  closed: number; // count of exit deals (closed round-trip legs)
  wins: number;
  losses: number;
  winRate: number; // 0..1, NaN-safe → 0 when no exits
}

function num(v: string | number | undefined): Decimal {
  return v === undefined ? new Decimal(0) : new Decimal(v.toString());
}

export function buildEquityCurve(deals: MapDeal[]): EquityCurve {
  const sorted = [...deals].sort((a, b) => Date.parse(a.dealtAt) - Date.parse(b.dealtAt));
  const out: EquityCurve = { points: [], net: 0, closed: 0, wins: 0, losses: 0, winRate: 0 };
  let acc = new Decimal(0);
  for (const d of sorted) {
    const t = Math.floor(Date.parse(d.dealtAt) / 1000);
    if (!Number.isFinite(t)) continue;
    const delta = num(d.profit).plus(num(d.commission)).plus(num(d.swap));
    acc = acc.plus(delta);
    if (d.entry === "OUT" || d.entry === "INOUT") {
      out.closed += 1;
      const realized = num(d.profit);
      if (realized.gt(0)) out.wins += 1;
      else if (realized.lt(0)) out.losses += 1;
    }
    // chart renderers need strictly increasing times — merge same-second deals
    const last = out.points[out.points.length - 1];
    if (last && last.time === t) last.value = acc.toNumber();
    else out.points.push({ time: t, value: acc.toNumber() });
  }
  out.net = acc.toNumber();
  out.winRate = out.closed > 0 ? out.wins / out.closed : 0;
  return out;
}
