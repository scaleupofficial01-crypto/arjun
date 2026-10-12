import { describe, it, expect } from "vitest";
import { parseCsv, parseTradeRow, tradesToCsv } from "../src/lib/trade-io";

describe("parseCsv", () => {
  it("parses quoted fields with commas and quotes", () => {
    const rows = parseCsv('symbol,notes\nBTCUSD,"breakout, retest"\nETHUSD,"say ""hi"""');
    expect(rows).toEqual([
      { symbol: "BTCUSD", notes: "breakout, retest" },
      { symbol: "ETHUSD", notes: 'say "hi"' },
    ]);
  });
});

describe("parseTradeRow", () => {
  it("parses valid row and recomputes pnl (never trusts file pnl)", () => {
    const r = parseTradeRow({
      symbol: "btcusd", side: "BUY", entryPrice: "100", exitPrice: "105",
      quantity: "2", fees: "1", entryAt: "2026-01-01", exitAt: "2026-01-02",
    });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.symbol).toBe("BTCUSD");
      expect(r.pnl).toBe("9.00000000");
      expect(r.status).toBe("CLOSED");
    }
  });
  it("no exit => OPEN, pnl null", () => {
    const r = parseTradeRow({ symbol: "BTCUSD", side: "SELL", entryPrice: "50", quantity: "1" });
    if (!("error" in r)) {
      expect(r.status).toBe("OPEN");
      expect(r.pnl).toBe(null);
    }
  });
  it("rejects invalid side / bad numbers", () => {
    expect("error" in parseTradeRow({ symbol: "X", side: "MAYBE", entryPrice: "1", quantity: "1" })).toBe(true);
    expect("error" in parseTradeRow({ symbol: "X", side: "BUY", entryPrice: "-5", quantity: "1" })).toBe(true);
  });
});

describe("tradesToCsv roundtrip", () => {
  it("export output parses back cleanly", () => {
    const csv = tradesToCsv([{
      symbol: "BTCUSD", side: "BUY", entryPrice: "100", exitPrice: "105",
      quantity: "2", risk: "10", fees: "1", entryAt: new Date("2026-01-01T00:00:00Z"),
      exitAt: new Date("2026-01-02T00:00:00Z"), setupTag: "breakout, v2",
      notes: 'note with "quotes"', status: "CLOSED", pnl: "9.00000000", group: null,
    }]);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("BTCUSD");
    expect(rows[0].setupTag).toBe("breakout, v2");
    expect(rows[0].notes).toBe('note with "quotes"');
    const re = parseTradeRow(rows[0]);
    if (!("error" in re)) expect(re.pnl).toBe("9.00000000");
  });
});
