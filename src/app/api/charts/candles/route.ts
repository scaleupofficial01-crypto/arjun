import { json, requireUser } from "@/lib/api";
import { GRANULARITIES, toCoinbaseProduct } from "@/lib/candles";

export const runtime = "nodejs";

/**
 * Real OHLC candles for the saved-chart panel.
 * Source: Coinbase Exchange public endpoint (no API key) — crypto pairs only.
 * Forex/equity candle history is honestly unsupported on the free tier.
 */

interface RawCandle extends Array<number> {
  0: number; // bucket start (unix s)
  1: number; // low
  2: number; // high
  3: number; // open
  4: number; // close
}

const cache = new Map<string, { at: number; payload: unknown }>();
const CACHE_MS = 30_000;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const tf = (url.searchParams.get("tf") ?? "1D").toUpperCase();
  const granularity = GRANULARITIES[tf];
  if (!symbol || symbol.length > 20) return json({ error: "symbol required" }, { status: 400 });
  if (!granularity) return json({ error: "tf must be one of 1H, 4H, 1D, 1W" }, { status: 400 });

  const product = toCoinbaseProduct(symbol);
  if (!product) {
    return json(
      {
        error: "candles-unsupported",
        message: `${symbol}: candle history only for crypto on the free tier (e.g. BTCUSD). The TradingView panel below still covers forex/stocks.`,
      },
      { status: 422 },
    );
  }

  const cacheKey = `${product}:${granularity}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.payload);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - granularity * 300;
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
      { signal: ctl.signal, headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) {
      return json(
        { error: "upstream", message: `Coinbase returned ${res.status} for ${product}` },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as RawCandle[] | { message?: string };
    if (!Array.isArray(raw)) {
      return json(
        { error: "upstream", message: `Coinbase rejected ${product}: ${raw.message ?? "unknown"}` },
        { status: 422 },
      );
    }
    const candles = raw
      .map((c) => ({ time: c[0], open: c[3], high: c[2], low: c[1], close: c[4] }))
      .sort((a, b) => a.time - b.time)
      .filter(
        (c, i, arr) =>
          Number.isFinite(c.open) && (i === 0 || c.time > arr[i - 1].time),
      );
    const payload = {
      symbol,
      product,
      tf,
      source: "Coinbase Exchange (live)",
      candles,
      time: new Date().toISOString(),
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return json(payload);
  } catch {
    return json({ error: "upstream", message: "Failed to reach Coinbase" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
