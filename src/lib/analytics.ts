import Decimal from "decimal.js";
import type { Trade } from "@prisma/client";

export interface TradeLike {
  symbol: string;
  side: "BUY" | "SELL";
  pnl: string | number | null; // stored, computed at write time
  exitAt: Date | string | null;
  entryAt: Date | string;
  risk?: string | number | null;
}

export interface AnalyticsResult {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  netPnl: string;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: string; // percent string e.g. "62.50"
  profitFactor: string | null; // gross win / gross loss, null if no losses
  expectancy: string; // avg pnl per closed trade
  avgWin: string | null;
  avgLoss: string | null;
  maxDrawdown: string; // largest drop vs TRUE historical peak
  maxDrawdownFromPeak: { peak: string; trough: string } | null;
  equityCurve: { at: string; equity: string }[];
  dailyPnl: Record<string, string>; // "YYYY-MM-DD" -> pnl
  monthlyPnl: Record<string, string>; // "YYYY-MM" -> pnl
  perInstrument: {
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    netPnl: string;
    winRate: string;
    profitFactor: string | null;
  }[];
}

const d = (v: string | number | null | undefined) => new Decimal(v ?? 0);

/**
 * All analytics computed purely from stored trade records (§3, §5:
 * no fabricated numbers).
 */
export function computeAnalytics(trades: TradeLike[]): AnalyticsResult {
  const closed = trades.filter((t) => t.pnl !== null).map((t) => ({
    ...t,
    pnlDec: d(t.pnl),
    exitDate: new Date(t.exitAt ?? t.entryAt),
  }));

  const wins = closed.filter((t) => t.pnlDec.gt(0));
  const losses = closed.filter((t) => t.pnlDec.lt(0));
  const breakeven = closed.filter((t) => t.pnlDec.isZero());

  const grossWin = wins.reduce((a, t) => a.plus(t.pnlDec), new Decimal(0));
  const grossLoss = losses.reduce((a, t) => a.plus(t.pnlDec.abs()), new Decimal(0));
  const netPnl = closed.reduce((a, t) => a.plus(t.pnlDec), new Decimal(0));

  const winRate =
    closed.length > 0
      ? new Decimal(wins.length).div(closed.length).times(100).toFixed(2)
      : "0.00";
  const profitFactor = grossLoss.gt(0)
    ? grossWin.div(grossLoss).toFixed(4)
    : grossWin.gt(0)
      ? "Infinity"
      : null;
  const expectancy = closed.length > 0
    ? netPnl.div(closed.length).toFixed(8)
    : "0.00000000";
  const avgWin = wins.length > 0 ? grossWin.div(wins.length).toFixed(8) : null;
  const avgLoss = losses.length > 0
    ? grossLoss.div(losses.length).neg().toFixed(8)
    : null;

  // Equity curve (chronological by exit time) & max drawdown vs TRUE peak
  const sorted = [...closed].sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
  let equity = new Decimal(0);
  let peak = new Decimal(0);
  let maxDD = new Decimal(0);
  let ddPair: { peak: string; trough: string } | null = null;
  const equityCurve: { at: string; equity: string }[] = [];
  for (const t of sorted) {
    equity = equity.plus(t.pnlDec);
    equityCurve.push({ at: t.exitDate.toISOString(), equity: equity.toFixed(8) });
    if (equity.gt(peak)) peak = equity;
    const dd = peak.minus(equity);
    if (dd.gt(maxDD)) {
      maxDD = dd;
      ddPair = { peak: peak.toFixed(8), trough: equity.toFixed(8) };
    }
  }

  const dailyPnl: Record<string, string> = {};
  const monthlyPnl: Record<string, string> = {};
  for (const t of closed) {
    const day = t.exitDate.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    dailyPnl[day] = d(dailyPnl[day]).plus(t.pnlDec).toFixed(8);
    monthlyPnl[month] = d(monthlyPnl[month]).plus(t.pnlDec).toFixed(8);
  }

  const bySymbol = new Map<string, typeof closed>();
  for (const t of closed) {
    const key = t.symbol.toUpperCase();
    if (!bySymbol.has(key)) bySymbol.set(key, []);
    bySymbol.get(key)!.push(t);
  }
  const perInstrument = [...bySymbol.entries()].map(([symbol, list]) => {
    const w = list.filter((t) => t.pnlDec.gt(0));
    const l = list.filter((t) => t.pnlDec.lt(0));
    const gw = w.reduce((a, t) => a.plus(t.pnlDec), new Decimal(0));
    const gl = l.reduce((a, t) => a.plus(t.pnlDec.abs()), new Decimal(0));
    const net = list.reduce((a, t) => a.plus(t.pnlDec), new Decimal(0));
    return {
      symbol,
      trades: list.length,
      wins: w.length,
      losses: l.length,
      netPnl: net.toFixed(8),
      winRate: list.length > 0
        ? new Decimal(w.length).div(list.length).times(100).toFixed(2)
        : "0.00",
      profitFactor: gl.gt(0) ? gw.div(gl).toFixed(4) : gw.gt(0) ? "Infinity" : null,
    };
  }).sort((a, b) => new Decimal(b.netPnl).cmp(new Decimal(a.netPnl)));

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.length - closed.length,
    netPnl: netPnl.toFixed(8),
    winCount: wins.length,
    lossCount: losses.length,
    breakevenCount: breakeven.length,
    winRate,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    maxDrawdown: maxDD.toFixed(8),
    maxDrawdownFromPeak: ddPair,
    equityCurve,
    dailyPnl,
    monthlyPnl,
    perInstrument,
  };
}

/** Serialized Trade → TradeLike */
export function tradeToLike(t: Trade): TradeLike {
  return {
    symbol: t.symbol,
    side: t.side,
    pnl: t.pnl === null ? null : t.pnl.toString(),
    exitAt: t.exitAt,
    entryAt: t.entryAt,
    risk: t.risk === null ? null : t.risk.toString(),
  };
}
