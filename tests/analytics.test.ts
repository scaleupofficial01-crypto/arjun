import { describe, it, expect } from "vitest";
import { computeAnalytics, type TradeLike } from "../src/lib/analytics";
import { computePnl } from "../src/lib/pnl";

const t = (over: Partial<TradeLike>): TradeLike => ({
  symbol: "BTCUSD",
  side: "BUY",
  pnl: "0",
  entryAt: "2026-01-01T00:00:00Z",
  exitAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("computePnl", () => {
  it("long: (exit-entry)*qty - fees", () => {
    expect(computePnl({ side: "BUY", entryPrice: "100", exitPrice: "110", quantity: "2", fees: "1" }))
      .toBe("19.00000000");
  });
  it("short: (entry-exit)*qty - fees", () => {
    expect(computePnl({ side: "SELL", entryPrice: "100", exitPrice: "90", quantity: "3", fees: "0" }))
      .toBe("30.00000000");
  });
  it("open trade (no exit) => null", () => {
    expect(computePnl({ side: "BUY", entryPrice: "100", exitPrice: null, quantity: "2" })).toBe(null);
  });
  it("decimal-exact, no float drift (0.1 + 0.2 territory)", () => {
    expect(computePnl({ side: "BUY", entryPrice: "0.1", exitPrice: "0.3", quantity: "0.2", fees: "0" }))
      .toBe("0.04000000");
  });
});

describe("computeAnalytics", () => {
  const trades: TradeLike[] = [
    t({ pnl: "100", exitAt: "2026-01-01T10:00:00Z" }),
    t({ pnl: "50", exitAt: "2026-01-02T10:00:00Z" }),
    t({ pnl: "-90", exitAt: "2026-01-03T10:00:00Z" }),
    t({ pnl: "-10", exitAt: "2026-01-03T11:00:00Z" }),
    t({ symbol: "ETHUSD", pnl: "200", exitAt: "2026-01-04T10:00:00Z" }),
    t({ pnl: null, exitAt: null }), // open trade — excluded from stats
  ];

  it("win rate, counts, net", () => {
    const a = computeAnalytics(trades);
    expect(a.closedTrades).toBe(5);
    expect(a.openTrades).toBe(1);
    expect(a.winCount).toBe(3);
    expect(a.lossCount).toBe(2);
    expect(a.winRate).toBe("60.00");
    expect(a.netPnl).toBe("250.00000000");
  });

  it("profit factor = gross win / gross loss", () => {
    const a = computeAnalytics(trades);
    // gross win = 350, gross loss = 100 => 3.5
    expect(a.profitFactor).toBe("3.5000");
  });

  it("expectancy = net / closed", () => {
    const a = computeAnalytics(trades);
    expect(a.expectancy).toBe("50.00000000");
  });

  it("max drawdown measured vs TRUE historical peak (not initial capital)", () => {
    const a = computeAnalytics(trades);
    // equity: 100 -> 150 (peak) -> 60 -> 50 -> 250. Max DD = 150 - 50 = 100
    expect(a.maxDrawdown).toBe("100.00000000");
    expect(a.maxDrawdownFromPeak).toEqual({ peak: "150.00000000", trough: "50.00000000" });
  });

  it("equity curve is chronological", () => {
    const a = computeAnalytics(trades);
    expect(a.equityCurve.map((p) => p.equity)).toEqual([
      "100.00000000", "150.00000000", "60.00000000", "50.00000000", "250.00000000",
    ]);
  });

  it("daily + monthly pnl maps", () => {
    const a = computeAnalytics(trades);
    expect(a.dailyPnl["2026-01-01"]).toBe("100.00000000");
    expect(a.dailyPnl["2026-01-03"]).toBe("-100.00000000");
    expect(a.monthlyPnl["2026-01"]).toBe("250.00000000");
  });

  it("per-instrument breakdown", () => {
    const a = computeAnalytics(trades);
    const btc = a.perInstrument.find((p) => p.symbol === "BTCUSD")!;
    const eth = a.perInstrument.find((p) => p.symbol === "ETHUSD")!;
    expect(btc.trades).toBe(4);
    expect(btc.netPnl).toBe("50.00000000");
    expect(eth.trades).toBe(1);
    expect(eth.profitFactor).toBe("Infinity");
  });

  it("empty input is safe zeros", () => {
    const a = computeAnalytics([]);
    expect(a.closedTrades).toBe(0);
    expect(a.winRate).toBe("0.00");
    expect(a.profitFactor).toBe(null);
    expect(a.maxDrawdown).toBe("0.00000000");
  });
});
