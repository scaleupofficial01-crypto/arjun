/** Timeframe → seconds, for the saved-chart candles endpoint. */
export const GRANULARITIES: Record<string, number> = {
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
  "1W": 604800,
};

/** Map a UI symbol like BTCUSD / BTC-USD → Coinbase product id BTC-USD. */
export function toCoinbaseProduct(symbol: string): string | null {
  const s = symbol.toUpperCase().trim();
  if (/^[A-Z]{2,10}-USD$/.test(s)) return s; // already BTC-USD form
  const FIAT = /^(EURUSD|GBPUSD|AUDUSD|NZDUSD|USDJPY|USDCHF|USDCAD)$/;
  if (/^[A-Z]{2,10}USD$/.test(s) && !FIAT.test(s)) {
    return `${s.slice(0, -3)}-USD`; // BTCUSD → BTC-USD (explicitly not fiat forex)
  }
  return null;
}
