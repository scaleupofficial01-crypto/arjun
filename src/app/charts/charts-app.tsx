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

/** TradingView-style symbol -> broker-style symbol for the MT5 trade panel. */
function brokerSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  return s.includes(":") ? s.split(":")[1]! : s;
}

export default function ChartsApp({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const tvSym = tvSymbol(symbol);
  const fsRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await fsRef.current?.requestFullscreen();
    } catch {
      /* browser blocked — button stays inert */
    }
  };

  return (
    <div
      ref={fsRef}
      className={`max-w-6xl mx-auto px-6 py-8 space-y-4 ${isFs ? "max-w-none h-screen overflow-auto bg-[var(--color-bg,#0b0f1a)]" : ""}`}
    >
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
        <button
          onClick={toggleFullscreen}
          className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] text-[var(--color-text)]"
          title="Chart ko full screen mein kholen (Esc = exit)"
        >
          {isFs ? "✕ Exit fullscreen (Esc)" : "⛶ Fullscreen"}
        </button>
      </div>

      {/* Official embed — bug #4 rule: embed-widget-advanced-chart.js inside
          .tradingview-widget-container. React double-mount guard via key. */}
      <div>
        <TvEmbed key={`tv-${symbol}`} tvSym={tvSym} fullscreen={isFs} hasPanel={false} />
      </div>
    </div>
  );
}

function TvEmbed({ tvSym, fullscreen, hasPanel }: { tvSym: string; fullscreen?: boolean; hasPanel?: boolean }) {
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
      // MT5-terminal look: solid black background, near-invisible grid
      backgroundColor: "#000000",
      gridColor: "rgba(30, 30, 30, 1)",
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
    <div className={`card p-1 ${fullscreen ? "border-0 !p-0" : ""}`}>
      <div
        ref={containerRef}
        style={
          fullscreen
            ? { height: "calc(100vh - 120px)", minHeight: 300 }
            : { height: "calc(100vh - 150px)", minHeight: 560 }
        }
      />
    </div>
  );
}
