/**
 * Real market data, free-tier providers only (§0: genuinely free, no key).
 * Rules (§5): alerts and watchlists use ONLY these real prices — never
 * demo/synthetic values. If nothing supports a symbol, we say so honestly.
 *
 * Sources:
 *  - Crypto: Coinbase public spot API — real, live, no key. Labeled "live".
 *  - Forex majors: Frankfurter (ECB reference rates) — real but DAILY
 *    reference rates. Labeled "delayed (ECB daily)".
 *  - Everything else: unsupported without a paid market-data key →
 *    explicit unsupported state. (Listed equity feeds are never free without
 *    a key; we do not fake them.)
 */

export interface PriceResult {
  symbol: string; // normalized, e.g. "BTC-USD", "EURUSD"
  price: string | null;
  source: string | null;
  live: boolean; // true=live tick, false=delayed reference
  supported: boolean;
  reason?: string;
}

const FX_BASES = ["EUR", "USD", "GBP", "JPY", "AUD", "NZD", "CHF", "CAD", "SEK", "NOK", "DKK"];

/** BTCUSDT / BTC-USD / BTCUSD -> BTC-USD (Coinbase style) */
export function normalizeCryptoSymbol(raw: string): string | null {
  const s = raw.toUpperCase().trim();
  const knownQuotes = ["USDT", "USDC", "USD"];
  for (const q of knownQuotes) {
    if (s.endsWith(q) && s.length > q.length) {
      return `${s.slice(0, -q.length)}-USD`;
    }
  }
  if (s.includes("-")) return s;
  return null;
}

function normalizeFxSymbol(raw: string): { base: string; quote: string } | null {
  const s = raw.toUpperCase().replace("/", "").replace("-", "").trim();
  if (s.length !== 6) return null;
  const base = s.slice(0, 3);
  const quote = s.slice(3);
  if (FX_BASES.includes(base) && FX_BASES.includes(quote)) return { base, quote };
  return null;
}

const TIMEOUT = 6000;

interface CoinbaseSpot { data?: { amount?: string } }
interface FrankfurterLatest { rates?: Record<string, number> }

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": "empire-hub/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** One symbol. Never fabricates; unsupported/unavailable is explicit. */
export async function getPrice(rawSymbol: string): Promise<PriceResult> {
  const raw = rawSymbol.toUpperCase().trim();

  // Forex first (6-letter fiat pairs)
  const fx = normalizeFxSymbol(raw);
  if (fx) {
    const data = await fetchJson<FrankfurterLatest>(
      `https://api.frankfurter.dev/v1/latest?base=${fx.base}&symbols=${fx.quote}`,
    );
    const rate = data?.rates?.[fx.quote];
    if (typeof rate === "number") {
      return {
        symbol: `${fx.base}${fx.quote}`,
        price: String(rate),
        source: "Frankfurter (ECB daily reference)",
        live: false,
        supported: true,
      };
    }
    return {
      symbol: `${fx.base}${fx.quote}`,
      price: null,
      source: null,
      live: false,
      supported: false,
      reason: "Provider reachable check failed — try again later",
    };
  }

  // Crypto via Coinbase (real live spot, no key)
  const cb = normalizeCryptoSymbol(raw);
  if (cb) {
    const data = await fetchJson<CoinbaseSpot>(`https://api.coinbase.com/v2/prices/${cb}/spot`);
    const amount = data?.data?.amount;
    if (amount) {
      return { symbol: cb, price: amount, source: "Coinbase (live spot)", live: true, supported: true };
    }
    return {
      symbol: cb,
      price: null,
      source: "Coinbase",
      live: true,
      supported: false,
      reason: "Pair not listed on Coinbase",
    };
  }

  return {
    symbol: raw,
    price: null,
    source: null,
    live: false,
    supported: false,
    reason:
      "Unsupported on free tier: listed-equity/index feeds need a market-data key (setup required)",
  };
}

export async function getPrices(symbols: string[]): Promise<Record<string, PriceResult>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase().trim()))];
  const entries = await Promise.all(unique.map(async (s) => [s, await getPrice(s)] as const));
  const map: Record<string, PriceResult> = {};
  for (const [k, v] of entries) map[k] = v;
  return map;
}
