"use client";

import { useEffect, useRef, useState } from "react";
import SavedChart from "./saved-chart";

/** Map a user-typed symbol to a TradingView symbol. */
function tvSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  if (s.includes(":")) return s;
  if (/^[A-Z]{6}$/.test(s) && /^(EUR|USD|GBP|JPY|AUD|NZD|CHF|CAD|SEK|NOK|DKK)/.test(s)) {
    return `FX:${s}`;
  }
  if (/USD(T|C)?$/.test(s)) {
    const base = s.replace(/USD(T|C)?$/, "");
    return `COINBASE:${base}USD`;
  }
  return s;
}

export default function ChartsApp({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const tvSym = tvSymbol(symbol);

  // React 18 StrictMode (dev) double-mounts: remount the widget per effect pass (bug #4 guard).
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Live Charts</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("symbol") ?? "").trim();
            if (v) setSymbol(v.toUpperCase());
          }}
        >
          <input name="symbol" defaultValue={symbol} key={symbol} className="input !py-1.5 w-40" placeholder="Symbol" />
          <button className="btn-primary !py-1.5 text-sm">Load</button>
        </form>
        <span className="badge badge-live">account-synced drawings + TradingView pro chart</span>
      </div>

      {/* Panel 1 — drawings that truly sync to the account (server-side). */}
      <SavedChart key={`saved-${symbol}`} symbol={symbol} />

      {/* Panel 2 — the full TradingView toolbox. */}
      <TvEmbed key={`tv-${symbol}`} tvSym={tvSym} />
    </div>
  );
}

/**
 * Official TradingView advanced-chart embed (bug #4 rule:
 * embed-widget-advanced-chart.js inside .tradingview-widget-container).
 * Its drawings auto-save in THIS BROWSER (TradingView's own storage) —
 * account/device sync lives in the My Saved Chart panel above.
 */
function TvEmbed({ tvSym }: { tvSym: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    host.innerHTML = "";
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    container.appendChild(inner);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      height: "100%",
      width: "100%",
      symbol: tvSym,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      details: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    host.appendChild(container);
    return () => {
      host.innerHTML = "";
    };
  }, [tvSym]);

  return (
    <div className="card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">TradingView Pro Chart — {tvSym}</h2>
        <span className="badge badge-demo">pro toolbox</span>
        <span className="text-xs text-[var(--color-muted)]">
          full indicator/fib toolbox · its drawings auto-save on this browser
        </span>
      </div>
      <div className="card p-1">
        <div ref={containerRef} style={{ height: "calc(100vh - 340px)", minHeight: 520 }} />
      </div>
    </div>
  );
}
