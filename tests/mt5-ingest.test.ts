import { describe, it, expect } from "vitest";
import {
  newIngestToken,
  hashIngestToken,
  parseIngestPayload,
  pairDealsToTrades,
  toIsoDate,
} from "@/lib/mt5";

describe("ingest tokens", () => {
  it("generates prefixed raw tokens + sha256 hash (raw not derivable from hash)", () => {
    const { raw, hash } = newIngestToken();
    expect(raw).toMatch(/^mt5_[A-Za-z0-9_-]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIngestToken(raw)).toBe(hash);
    expect(hashIngestToken("mt5_wrong")).not.toBe(hash);
  });
});

describe("payload parsing", () => {
  const good = {
    account: { login: "5100123", server: "ICMarkets-Demo", balance: 10000, equity: 10112.5, currency: "USD" },
    positions: [
      { ticket: "9001", symbol: "XAUUSD", side: "BUY", volume: 0.1, openPrice: 4020.5, openAt: 1760300000, profit: 12.5 },
    ],
    deals: [
      { ticket: "8001", positionId: "9000", symbol: "XAUUSD", side: "BUY", entry: "IN", volume: 0.1, price: 4010, profit: 0, commission: -0.7, swap: 0, dealtAt: 1760200000 },
      { ticket: "8002", positionId: "9000", symbol: "XAUUSD", side: "SELL", entry: "OUT", volume: 0.1, price: 4032.5, profit: 2.25, commission: -0.7, swap: 0, dealtAt: 1760250000 },
    ],
  };

  it("accepts a valid payload (unix seconds or ISO both ok)", () => {
    const p = parseIngestPayload(good);
    expect(p.account.balance).toBe(10000);
    expect(p.positions[0].openAt).toBe(new Date(1760300000 * 1000).toISOString());
    const p2 = parseIngestPayload({ ...good, deals: [{ ...good.deals[0], dealtAt: "2026-10-12T09:30:00.000Z" }] });
    expect(p2.deals[0].dealtAt).toBe("2026-10-12T09:30:00.000Z");
  });

  it("rejects junk honestly", () => {
    expect(() => parseIngestPayload(null)).toThrow(/object/);
    expect(() => parseIngestPayload({ deals: [{}] })).toThrow(/required/);
    expect(() => parseIngestPayload({ deals: [{ ...good.deals[0], side: "LONG" }] })).toThrow(/side/);
    expect(() => parseIngestPayload({ deals: [{ ...good.deals[0], volume: -1 }] })).toThrow(/volume and price/);
    expect(() => parseIngestPayload({ positions: Array(501).fill(good.positions[0]) })).toThrow(/capped/);
  });
});

describe("deal pairing into journal trades", () => {
  it("pairs IN+OUT into one closed draft with exact decimal math inputs", () => {
    const deals = [
      { ticket: "8001", positionId: "9000", symbol: "XAUUSD", side: "BUY" as const, entry: "IN", volume: "0.1", price: "4010", commission: "-0.7", swap: "0", dealtAt: new Date("2026-10-12T09:00:00Z") },
      { ticket: "8002", positionId: "9000", symbol: "XAUUSD", side: "SELL" as const, entry: "OUT", volume: "0.1", price: "4032.5", commission: "-0.7", swap: "-0.35", dealtAt: new Date("2026-10-12T10:00:00Z") },
      { ticket: "8003", positionId: "9001", symbol: "EURUSD", side: "BUY" as const, entry: "IN", volume: "1", price: "1.10", commission: "0", swap: "0", dealtAt: new Date("2026-10-12T11:00:00Z") },
      // 9001 has no OUT deal — must be skipped (still open)
    ];
    const drafts = pairDealsToTrades(deals);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      symbol: "XAUUSD",
      side: "BUY",
      entryPrice: "4010.00000000",
      exitPrice: "4032.50000000",
      quantity: "0.10000000",
      entryAt: "2026-10-12T09:00:00.000Z",
      exitAt: "2026-10-12T10:00:00.000Z",
      setupTag: "MT5 sync",
      positionId: "9000",
    });
    expect(drafts[0].fees).toBe("1.75000000"); // |−0.7|+|−0.7|+|−0.35|
    expect(drafts[0].dealTickets).toEqual(["8001", "8002"]);
  });

  it("skips IN-only positions and self-paired junk", () => {
    expect(pairDealsToTrades([
      { ticket: "1", positionId: "P", symbol: "S", side: "BUY" as const, entry: "IN", volume: "1", price: "2", commission: "0", swap: "0", dealtAt: new Date(0) },
    ])).toHaveLength(0);
  });
});

describe("toIsoDate", () => {
  it("handles seconds, ISO, and junk", () => {
    expect(toIsoDate(1760200000)).toBe(new Date(1760200000 * 1000).toISOString());
    expect(toIsoDate("2026-10-01T00:00:00.000Z")).toBe("2026-10-01T00:00:00.000Z");
    expect(toIsoDate("nope")).toBeNull();
    expect(toIsoDate(123)).toBeNull();
  });
});
