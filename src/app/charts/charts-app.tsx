"use client";

import { useEffect, useRef, useState } from "react";

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
        <span className="badge badge-live">TradingView advanced chart</span>
      </div>

      <div className="text-xs text-[var(--color-muted)] card p-3 space-y-1">
        <p>
          <span className="text-[var(--color-profit)] font-medium">✓ Saving (built-in):</span>{" "}
          jo bhi trendlines/tools aap yahan draw karte ho, TradingView unhe{" "}
          <b>isi browser me automatically save</b> karta hai — reload ya baad me wapas aane
          par wo waise-ki-waise milengi.
        </p>
        <p>
          <span className="text-amber-400 font-medium">Note:</span> cross-device account sync
          free widget me technically possible nahi (TradingView khud parent page ko drawing
          data nahi deta; wo unki licensed Charting Library ka feature hai). Yahan kuch bhi
          fake nahi hai.
        </p>
      </div>

      {/* Official embed — bug #4 rule: embed-widget-advanced-chart.js inside
          .tradingview-widget-container. React double-mount guard via key. */}
      <TvEmbed key={`tv-${symbol}`} tvSym={tvSym} />
    </div>
  );
}

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
    <div className="card p-1">
      <div ref={containerRef} style={{ height: "calc(100vh - 300px)", minHeight: 560 }} />
    </div>
  );
}
