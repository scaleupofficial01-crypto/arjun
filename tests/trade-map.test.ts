import { describe, it, expect } from "vitest";
import { buildTradeMap, buildRoundTrips } from "@/lib/trade-map";

const deals = [
  { ticket: "8001", positionId: "9000", symbol: "XAUUSD", side: "BUY", entry: "IN", volume: "0.1", price: "4010", profit: "0", commission: "-0.7", swap: "0", dealtAt: "2026-10-12T09:00:00.000Z" },
  { ticket: "8002", positionId: "9000", symbol: "XAUUSD", side: "SELL", entry: "OUT", volume: "0.1", price: "4032.5", profit: "2.25", commission: "-0.7", swap: "-0.35", dealtAt: "2026-10-12T10:00:00.000Z" },
  { ticket: "8003", positionId: "9001", symbol: "XAUUSD", side: "SELL", entry: "IN", volume: "0.2", price: "4050", profit: "0", commission: "0", swap: "0", dealtAt: "2026-10-12T11:00:00.000Z" },
  { ticket: "8004", positionId: "9001", symbol: "XAUUSD", side: "BUY", entry: "OUT", volume: "0.2", price: "4060", profit: "-1.0", commission: "0", swap: "0", dealtAt: "2026-10-12T12:00:00.000Z" },
];

describe("trade map builder", () => {
  const maps = buildTradeMap(deals);

  it("groups by symbol and sorts points chronologically", () => {
    expect(maps).toHaveLength(1);
    const m = maps[0];
    expect(m.symbol).toBe("XAUUSD");
    expect(m.points.map((p) => p.value)).toEqual([4010, 4032.5, 4050, 4060]);
  });

  it("builds TV-style labeled markers (side+volume on entry, pnl on exit)", () => {
    const m = maps[0];
    expect(m.markers).toHaveLength(4);
    expect(m.markers[0]).toMatchObject({ position: "belowBar", shape: "arrowUp", color: "#22c55e", text: "BUY 0.1" });
    expect(m.markers[1]).toMatchObject({ position: "aboveBar", shape: "arrowDown", color: "#22c55e", text: "EXIT +2.25" });
    expect(m.markers[3]).toMatchObject({ color: "#ef4444", text: "EXIT -1.00" });
  });

  it("builds MT5-style round-trips (one clean row per closed trade)", () => {
    const trips = buildRoundTrips(deals);
    expect(trips).toHaveLength(2);
    const win = trips.find((t) => t.positionId === "9000")!;
    expect(win).toMatchObject({
      symbol: "XAUUSD", side: "BUY", volume: 0.1,
      openPrice: 4010, closePrice: 4032.5,
      commission: -1.4, swap: -0.35, profit: 2.25, win: true,
    });
    const loss = trips.find((t) => t.positionId === "9001")!;
    expect(loss).toMatchObject({ side: "SELL", volume: 0.2, profit: -1, win: false });
    // newest close first
    expect(trips[0].positionId).toBe("9001");
  });

  it("round-trips skip still-open positions", () => {
    expect(buildRoundTrips([deals[0]])).toHaveLength(0);
  });

  it("pairs round-trips into win/loss segments from real prices", () => {
    const m = maps[0];
    expect(m.segments).toHaveLength(2);
    const win = m.segments.find((s) => s.positionId === "9000")!;
    expect(win).toMatchObject({ from: { value: 4010 }, to: { value: 4032.5 }, win: true });
    const loss = m.segments.find((s) => s.positionId === "9001")!;
    expect(loss.win).toBe(false);
    expect(loss.profit).toBeCloseTo(-1.0);
  });

  it("ignores junk prices and never crashes on empty input", () => {
    expect(buildTradeMap([])).toEqual([]);
    const m = buildTradeMap([{ ...deals[0], price: "0" }]);
    expect(m[0].points).toHaveLength(0);
    expect(m[0].segments).toHaveLength(0);
  });
});
