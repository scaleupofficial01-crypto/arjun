import { json, requireUser } from "@/lib/api";
import { resolveCandleSource } from "@/lib/market-candles";

export const runtime = "nodejs";

interface Candle { time: number; open: number; high: number; low: number; close: number }

const cache = new Map<string, { at: number; payload: unknown }>();
const CACHE_MS = 5 * 60_000;

/** Real daily candles behind the Trade Map — provider honestly labeled. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").trim();
  if (!symbol || symbol.length > 16) return json({ error: "symbol required" }, { status: 400 });

  const src = resolveCandleSource(symbol);
  if (!src) {
    return json(
      { error: "unsupported", message: `${symbol}: no real OHLC feed available free — trade map will show your deal-price trace instead` },
      { status: 422 },
    );
  }

  const key = `${src.kind}:${src.kind === "coinbase" ? src.product : src.symbol}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.payload);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    let candles: Candle[] = [];
    if (src.kind === "coinbase") {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 86400 * 300;
      const res = await fetch(
        `https://api.exchange.coinbase.com/products/${src.product}/candles?granularity=86400&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
        { signal: ctl.signal, headers: { accept: "application/json" }, cache: "no-store" },
      );
      if (!res.ok) return json({ error: "upstream", message: `Coinbase ${res.status}` }, { status: 502 });
      const raw = (await res.json()) as number[][];
      if (!Array.isArray(raw)) return json({ error: "upstream", message: "Coinbase rejected symbol" }, { status: 422 });
      candles = raw.map((c) => ({ time: c[0], open: c[3], high: c[2], low: c[1], close: c[4] }));
    } else {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(src.symbol)}?range=6mo&interval=1d`,
        { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store" },
      );
      if (!res.ok) return json({ error: "upstream", message: `Yahoo ${res.status}` }, { status: 502 });
      const data = (await res.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[] } }[] };
      };
      const r = data.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0];
      if (!q?.close) return json({ error: "upstream", message: "Yahoo returned no candles" }, { status: 422 });
      candles = ts.map((t, i) => ({
        time: t,
        open: q.open?.[i] ?? NaN,
        high: q.high?.[i] ?? NaN,
        low: q.low?.[i] ?? NaN,
        close: q.close?.[i] ?? NaN,
      }));
    }
    candles = candles
      .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time)
      .filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time)
      .slice(-300);
    const payload = { symbol, source: src.label, proxyNote: src.kind === "yahoo" ? src.proxyNote ?? null : null, candles };
    cache.set(key, { at: Date.now(), payload });
    return json(payload);
  } catch {
    return json({ error: "upstream", message: "candle fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
