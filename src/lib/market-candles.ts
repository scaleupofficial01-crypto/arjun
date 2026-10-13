/**
 * Candle-source resolver — REAL providers only, honestly labeled.
 * Free tier coverage:
 *  - crypto spot            → Coinbase Exchange public candles (live)
 *  - fiat forex (EURUSD…)   → Yahoo daily OHLC (delayed, free)
 *  - metals (XAUUSD/XAGUSD) → Yahoo futures proxy GC=F / SI=F (NOT spot —
 *                             labeled as the proxy it is; close enough for
 *                             context, never claimed as spot gold feed)
 * Anything else → null (caller shows the honest "no free feed" note).
 */

export type CandleSource =
  | { kind: "coinbase"; product: string; label: string }
  | { kind: "yahoo"; symbol: string; label: string; proxyNote?: string };

const FIAT_RE = /^(EURUSD|GBPUSD|AUDUSD|NZDUSD|USDJPY|USDCHF|USDCAD|USDINR|EURGBP|EURINR|GBPINR|GBPJPY)$/;

export function resolveCandleSource(raw: string): CandleSource | null {
  const s = raw.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  if (!s || s.length > 12) return null;

  // Metals via futures proxy (honest label)
  if (s === "XAUUSD" || s === "GOLD") {
    return { kind: "yahoo", symbol: "GC=F", label: "Yahoo · gold futures GC=F · daily (delayed)", proxyNote: "futures proxy for spot gold — not an exact XAUUSD feed" };
  }
  if (s === "XAGUSD" || s === "SILVER") {
    return { kind: "yahoo", symbol: "SI=F", label: "Yahoo · silver futures SI=F · daily (delayed)", proxyNote: "futures proxy for spot silver" };
  }

  // Fiat forex
  if (FIAT_RE.test(s)) {
    return { kind: "yahoo", symbol: `${s}=X`, label: `Yahoo · ${s}=X · daily (delayed)` };
  }

  // Crypto spot via Coinbase
  if (/^[A-Z]{2,10}USD$/.test(s)) {
    const base = s.slice(0, -3);
    return { kind: "coinbase", product: `${base}-USD`, label: `Coinbase Exchange · ${base}/USD · daily (live)` };
  }
  return null;
}
