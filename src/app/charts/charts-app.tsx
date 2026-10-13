"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LS_PREFIX = "tradingview";

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

/** Capture this browser's TradingView store (layout incl. drawings). */
function captureTvStore(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) out[k] = localStorage.getItem(k) ?? "";
    }
  } catch { /* ignore */ }
  return out;
}

/** Prime localStorage from a saved blob before the widget mounts. */
function restoreTvStore(data: Record<string, string>) {
  try {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(LS_PREFIX)) localStorage.setItem(k, v);
    }
  } catch { /* ignore */ }
}

export default function ChartsApp({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [status, setStatus] = useState<"idle" | "restoring" | "saving" | "saved" | "error">("idle");
  const [hasSaved, setHasSaved] = useState(false);
  const [dataNote, setDataNote] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSavedHash = useRef<string>("");

  const tvSym = tvSymbol(symbol);

  /** Load widget after restoring any saved per-symbol layout. */
  useEffect(() => {
    let cancelled = false;
    setStatus("restoring");
    setHasSaved(false);
    fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return;
        if (res?.data && typeof res.data === "object" && Object.keys(res.data).length > 0) {
          restoreTvStore(res.data as Record<string, string>);
          setHasSaved(true);
          lastSavedHash.current = JSON.stringify(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setStatus("idle");
        mountWidget();
      });

    function mountWidget() {
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
      // Bug #4 rule: embed-widget-advanced-chart.js, NOT legacy tv.js
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.async = true;
      script.innerHTML = JSON.stringify({
        // autosize: iframe fills 100% of the widget div (fixes dead space bug)
        autosize: true,
        height: "100%",
        width: "100%",
        symbol: tvSym,
        interval: statusInterval(),
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
      setDataNote(
        `${tvSym} — data by TradingView (live or delayed per exchange policy). Drawings you add are captured and saved to your account per symbol.`,
      );
    }
    function statusInterval() { return "D"; }
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  /** Save current store to the server (per user per symbol). */
  const save = useCallback(async () => {
    const data = captureTvStore();
    if (Object.keys(data).length === 0) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    const res = await fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (res.ok) {
      lastSavedHash.current = JSON.stringify(data);
      setStatus("saved");
      setHasSaved(true);
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      setStatus("error");
    }
  }, [symbol]);

  /** Autosave every 20s when the store changed (drawings added/edited). */
  useEffect(() => {
    const t = setInterval(() => {
      const data = captureTvStore();
      if (Object.keys(data).length === 0) return;
      const hash = JSON.stringify(data);
      if (hash !== lastSavedHash.current) void save();
    }, 20000);
    return () => clearInterval(t);
  }, [save]);

  async function clearSaved() {
    if (!confirm(`Delete ALL saved drawings for ${symbol}? This is the only way they are removed.`)) return;
    await fetch(`/api/charts/layout?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    setHasSaved(false);
    location.reload();
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
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
          <input name="symbol" defaultValue={symbol} className="input !py-1.5 w-40" placeholder="Symbol" />
          <button className="btn-primary !py-1.5 text-sm">Load</button>
        </form>
        <span className="badge badge-live">TradingView advanced chart</span>
        {hasSaved && <span className="badge badge-demo">saved drawings restored</span>}
        <div className="ml-auto flex gap-2 items-center">
          {status === "saving" && <span className="text-xs text-[var(--color-muted)]">saving…</span>}
          {status === "saved" && <span className="text-xs text-[var(--color-profit)]">saved ✓</span>}
          {status === "error" && <span className="text-xs text-[var(--color-loss)]">nothing to save / error</span>}
          <button onClick={save} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">
            💾 Save drawings now
          </button>
          {hasSaved && (
            <button onClick={clearSaved} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)]">
              Delete saved drawings
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted)]">{dataNote}</p>
      <div className="card p-1">
        <div
          ref={containerRef}
          style={{ height: "calc(100vh - 320px)", minHeight: 560 }}
        />
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Draw trendlines/lines inside the chart with the left toolbar (💾 autosaves every 20s and
        on the button). Saved per symbol to your account — they come back after refresh,
        re-login, or on another device. They are removed only via “Delete saved drawings”.
      </p>
    </div>
  );
}
