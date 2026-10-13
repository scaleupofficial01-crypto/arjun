import { describe, it, expect } from "vitest";
import { resolveCandleSource } from "@/lib/market-candles";

describe("candle source resolver", () => {
  it("maps fiat forex to Yahoo =X daily", () => {
    expect(resolveCandleSource("EURUSD")).toMatchObject({ kind: "yahoo", symbol: "EURUSD=X" });
    expect(resolveCandleSource("usdjpy")).toMatchObject({ kind: "yahoo", symbol: "USDJPY=X" });
  });
  it("maps metals to honest futures proxies (never fake spot)", () => {
    const g = resolveCandleSource("XAUUSD");
    expect(g?.kind).toBe("yahoo");
    expect((g as { symbol: string }).symbol).toBe("GC=F");
    expect((g as { proxyNote?: string }).proxyNote).toContain("proxy");
  });
  it("maps crypto to Coinbase products", () => {
    expect(resolveCandleSource("BTCUSD")).toMatchObject({ kind: "coinbase", product: "BTC-USD" });
  });
  it("rejects what no free real feed covers", () => {
    expect(resolveCandleSource("NIFTYFUT")).toBeNull();
    expect(resolveCandleSource("")).toBeNull();
  });
});
