import { describe, it, expect } from "vitest";
import { toCoinbaseProduct, GRANULARITIES } from "@/lib/candles";

describe("candles symbol mapping", () => {
  it("maps UI crypto symbols to Coinbase products", () => {
    expect(toCoinbaseProduct("BTCUSD")).toBe("BTC-USD");
    expect(toCoinbaseProduct("ethusd")).toBe("ETH-USD");
    expect(toCoinbaseProduct("SOL-USD")).toBe("SOL-USD");
  });
  it("rejects fiat forex honestly (no free OHLC)", () => {
    expect(toCoinbaseProduct("EURUSD")).toBeNull();
    expect(toCoinbaseProduct("USDJPY")).toBeNull();
  });
  it("rejects junk", () => {
    expect(toCoinbaseProduct("AAPL")).toBeNull();
    expect(toCoinbaseProduct("")).toBeNull();
  });
  it("granularities are sane", () => {
    expect(GRANULARITIES["1D"]).toBe(86400);
    expect(Object.keys(GRANULARITIES)).toContain("1W");
  });
});
