"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MT5-mobile style quick-trade panel: SELL (live bid) / volume stepper /
 * BUY (live ask) — exactly like the terminal app's order bar.
 *
 * Quotes come from the terminal-side v2 EA pushing the BROKER'S OWN feed.
 * Clicking SELL/BUY queues a market-position command on the server; the EA
 * claims it on its next poll, executes it inside the user's terminal, and
 * reports the broker's verdict. Nothing is simulated: if the EA is offline,
 * v1-only, or the broker rejects, the UI says exactly that.
 */

export interface PanelAccount {
  id: string;
  label: string;
  login: string;
  server: string;
  eaVersion?: string | null;
  lastSyncAt?: string | null;
}

interface Quote { symbol: string; bid: string; ask: string; ageS: number }
interface Command {
  id: string; symbol: string; side: string; volume: string; status: string;
  ticket: string | null; error: string | null;
}

/** Client twin of lib/mt5.ts eaSupportsTrading (server lib uses nodecrypto). */
function eaSupportsTrading(v: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)$/.exec(v ?? "");
  if (!m) return false;
  return Number(m[1]) * 100 + Number(m[2]) >= 200;
}

const fmt = (n: string | null | undefined, d = 5) => {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v >= 100 ? v.toFixed(2) : v.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
};

export default function TradePanel({
  accounts,
  initialSymbol,
  onTraded,
}: {
  accounts: PanelAccount[];
  initialSymbol?: string;
  onTraded?: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [symbol, setSymbol] = useState((initialSymbol ?? "XAUUSD").toUpperCase());
  const [volume, setVolume] = useState("0.01");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "BUY" | "SELL">(null);
  const [status, setStatus] = useState<{ kind: "info" | "ok" | "err"; text: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cmdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const tradingOk = eaSupportsTrading(account?.eaVersion);
  const syncAgeS = account?.lastSyncAt
    ? Math.round((Date.now() - new Date(account.lastSyncAt).getTime()) / 1000)
    : null;
  const eaLive = syncAgeS !== null && syncAgeS < 90;

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol.toUpperCase());
  }, [initialSymbol]);

  // ---- live quote polling (terminal's own feed) ----
  const refreshQuote = useCallback(async () => {
    if (!accountId || !symbol) return;
    try {
      const r = await fetch(`/api/mt5/quotes?account=${encodeURIComponent(accountId)}&symbol=${encodeURIComponent(symbol)}`);
      if (!r.ok) { setQuote(null); setQuoteErr(`HTTP ${r.status}`); return; }
      const d = (await r.json()) as { quotes: Quote[] };
      const q = d.quotes?.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
      setQuote(q);
      setQuoteErr(null);
    } catch {
      setQuoteErr("network");
    }
  }, [accountId, symbol]);

  useEffect(() => {
    setQuote(null);
    void refreshQuote();
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => void refreshQuote(), 3000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [refreshQuote]);

  useEffect(() => () => { if (cmdTimer.current) clearInterval(cmdTimer.current); }, []);

  // ---- SELL / BUY ----
  const watchCommand = useCallback((id: string) => {
    if (cmdTimer.current) clearInterval(cmdTimer.current);
    let tries = 0;
    cmdTimer.current = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(`/api/mt5/commands?account=${encodeURIComponent(accountId)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { commands: Command[] };
        const c = d.commands.find((x) => x.id === id);
        if (!c) return;
        if (c.status === "DONE") {
          if (cmdTimer.current) clearInterval(cmdTimer.current);
          setBusy(null);
          setStatus({ kind: "ok", text: `✓ ${c.side} ${c.volume} ${c.symbol} executed — ticket #${c.ticket} (terminal fill)` });
          onTraded?.();
        } else if (c.status === "FAILED") {
          if (cmdTimer.current) clearInterval(cmdTimer.current);
          setBusy(null);
          setStatus({ kind: "err", text: `✗ Broker rejected: ${c.error}` });
        } else if (tries > 20) {
          if (cmdTimer.current) clearInterval(cmdTimer.current);
          setBusy(null);
          setStatus({ kind: "info", text: `Command abhi bhi QUEUED/TAKEN hai — offline EA wapas aate hi verdict yahi dikh jayega.` });
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, [accountId, onTraded]);

  const place = useCallback(async (side: "BUY" | "SELL") => {
    const vol = Number(volume);
    if (!accountId || !symbol || !Number.isFinite(vol) || vol <= 0) {
      setStatus({ kind: "err", text: "Symbol aur volume check karo." });
      return;
    }
    setBusy(side);
    setStatus(null);
    try {
      const r = await fetch("/api/mt5/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, symbol, side, volume: vol }),
      });
      const d = (await r.json()) as { error?: string; message?: string; command?: Command; eaHint?: string | null };
      if (!r.ok || !d.command) {
        setBusy(null);
        setStatus({ kind: "err", text: d.message ?? d.error ?? `HTTP ${r.status}` });
        return;
      }
      setStatus({ kind: "info", text: `QUEUED — EA ke agle poll pe execute hogi… ${d.eaHint ?? ""}` });
      watchCommand(d.command.id);
    } catch {
      setBusy(null);
      setStatus({ kind: "err", text: "network error" });
    }
  }, [accountId, symbol, volume, watchCommand]);

  const spread = quote ? Math.abs(Number(quote.ask) - Number(quote.bid)) : null;
  const btnBase = "flex-1 rounded-lg px-3 py-2 text-left transition disabled:opacity-40 disabled:cursor-not-allowed";
  const canTrade = tradingOk;

  return (
    <div className="card p-3 space-y-2 bg-black/60">
      {/* top row: account / symbol / spread — MT5 mobile order-bar style */}
      <div className="flex items-center gap-2 text-xs">
        {accounts.length > 1 ? (
          <select
            className="input !py-1 !text-xs w-48"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.login}</option>)}
          </select>
        ) : account ? (
          <span className="text-[var(--color-muted)]">{account.label} · {account.login}@{account.server}</span>
        ) : null}
        <input
          className="input !py-1 w-28 !text-center font-semibold"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="XAUUSD"
          maxLength={20}
        />
        <span className="ml-auto font-mono text-[var(--color-muted)]">
          {quoteErr ? `quotes: ${quoteErr}` : spread !== null ? `spread ${spread < 1 ? spread.toFixed(5).replace(/0+$/, "").replace(/\.$/, "") : spread.toFixed(2)}` : "spread —"}
        </span>
      </div>

      {/* main row: SELL | volume | BUY */}
      <div className="flex items-stretch gap-2">
        <button
          className={`${btnBase} bg-[#c2192a] hover:bg-[#d51f31] text-white`}
          disabled={!canTrade || busy !== null}
          onClick={() => void place("SELL")}
          title={canTrade ? "Market SELL at bid" : "v2 EA chahiye"}
        >
          <div className="text-[10px] tracking-wide opacity-80">SELL</div>
          <div className="text-sm font-bold font-mono leading-5">{busy === "SELL" ? "…" : fmt(quote?.bid)}</div>
        </button>

        {/* volume stepper — MT5 mobile style: ∨  0.01  ∧ */}
        <div className="flex flex-col items-center justify-center px-2 rounded-lg border border-[var(--color-border)] bg-black/40 min-w-[88px]">
          <button
            className="text-sm leading-none text-[var(--color-muted)] hover:text-white"
            onClick={() => setVolume((v) => (Math.max(0.01, Number(v) - 0.01)).toFixed(2))}
            aria-label="volume kam"
          >∨</button>
          <input
            className="w-16 bg-transparent text-center font-mono text-base outline-none"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            inputMode="decimal"
          />
          <button
            className="text-sm leading-none text-[var(--color-muted)] hover:text-white"
            onClick={() => setVolume((v) => (Number(v) + 0.01).toFixed(2))}
            aria-label="volume zyada"
          >∧</button>
        </div>

        <button
          className={`${btnBase} bg-[#089981] hover:bg-[#0aa88d] text-white text-right`}
          disabled={!canTrade || busy !== null}
          onClick={() => void place("BUY")}
          title={canTrade ? "Market BUY at ask" : "v2 EA chahiye"}
        >
          <div className="text-[10px] tracking-wide opacity-80">BUY</div>
          <div className="text-sm font-bold font-mono leading-5">{busy === "BUY" ? "…" : fmt(quote?.ask)}</div>
        </button>
      </div>

      {/* status strip — the honest state machine, always labeled */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {!tradingOk ? (
          <span className="badge badge-setup">trading locked — may pe v2 empire_bridge.mq5 replace karo (ek sync ke baad live)</span>
        ) : eaLive ? (
          <span className="badge badge-live">EA live · synced {syncAgeS}s pehle</span>
        ) : (
          <span className="badge badge-setup">{syncAgeS === null ? "EA kabhi sync nahi hua" : `EA offline — ${Math.round((syncAgeS ?? 0) / 60)}min pehle last sync`}</span>
        )}
        {quote && (
          <span className={quote.ageS <= 30 ? "text-[var(--color-muted)]" : "text-amber-400"}>
            tick {quote.ageS}s purana{quote.ageS > 30 ? " (stale)" : ""} · terminal feed
          </span>
        )}
        {!quote && tradingOk && (
          <span className="text-[var(--color-muted)]">is symbol ka quote abhi nahi aaya — Market Watch me add karke rakho; click kar sakte ho, EA validate karega</span>
        )}
      </div>

      {status && (
        <div className={`text-xs rounded-lg px-3 py-2 ${
          status.kind === "ok" ? "bg-[#089981]/15 text-[var(--color-profit)]"
          : status.kind === "err" ? "bg-[#c2192a]/15 text-[var(--color-loss)]"
          : "bg-white/5 text-[var(--color-muted)]"
        }`}>
          {status.text}
        </div>
      )}
    </div>
  );
}
