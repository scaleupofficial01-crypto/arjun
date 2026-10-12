"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Item { id: string; symbol: string; note: string | null }
interface Watchlist { id: string; name: string; items: Item[] }
interface Alert {
  id: string; symbol: string; condition: string; targetPrice: string; note: string | null;
  active: boolean; triggeredAt: string | null; triggeredPrice: string | null; lastCheckedAt: string | null;
}
interface PriceInfo {
  price: string | null; source: string | null; live: boolean; supported: boolean; reason?: string;
}

type ApiData = { error?: string } & Record<string, unknown>;
async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; data: ApiData }> {
  const res = await fetch(path, init);
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as ApiData };
}
const post = (p: string, b: unknown) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const patch = (p: string, b: unknown) => api(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const del = (p: string) => api(p, { method: "DELETE" });

export default function WatchlistsApp({ watchlists, alerts }: { watchlists: Watchlist[]; alerts: Alert[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [pricesNote, setPricesNote] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; data: ApiData }>) {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.data.error ?? "Action failed"); return false; }
    router.refresh();
    return true;
  }

  async function createWatchlist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    if (await run(() => post("/api/watchlists", { name }))) (e.target as HTMLFormElement).reset();
  }
  async function addItem(wl: Watchlist, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const symbol = String(fd.get("symbol") ?? "").trim();
    if (!symbol) return;
    await run(() => post(`/api/watchlists/${wl.id}/items`, { symbol, note: fd.get("note") || null }));
    (e.target as HTMLFormElement).reset();
  }
  async function loadPrices(symbols: string[]) {
    if (symbols.length === 0) return;
    setPricesNote("Loading real prices…");
    const r = await api(`/api/prices?symbols=${encodeURIComponent(symbols.join(","))}`);
    if (!r.ok) { setPricesNote(null); setError(r.data.error ?? "Price load failed"); return; }
    setPrices((prev) => ({ ...prev, ...(r.data.prices as Record<string, PriceInfo>) }));
    setPricesNote(`Updated ${new Date().toLocaleTimeString()} — sources labeled per symbol; nothing synthetic.`);
  }
  async function createAlert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      symbol: fd.get("symbol"), condition: fd.get("condition"),
      targetPrice: fd.get("targetPrice"), note: fd.get("note") || null,
    };
    if (await run(() => post("/api/alerts", body))) (e.target as HTMLFormElement).reset();
  }
  async function checkNow() {
    setBusy(true); setCheckMsg(null); setError(null);
    const r = await post("/api/alerts/check", {});
    setBusy(false);
    if (!r.ok) { setError(r.data.error ?? "Check failed"); return; }
    setCheckMsg(`Checked ${Number(r.data.checked ?? 0)} alerts — ${Number(r.data.triggered ?? 0)} triggered, ${Number(r.data.skippedUnsupported ?? 0)} skipped (unsupported/unavailable price).`);
    router.refresh();
  }

  const activeAlerts = alerts.filter((a) => a.active);
  const doneAlerts = alerts.filter((a) => !a.active);

  return (
    <div className="max-w-7xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
      {error && <div className="lg:col-span-2 card p-3 border-[var(--color-loss)] text-sm text-[var(--color-loss)]">{error}</div>}

      {/* ---------------- watchlists ---------------- */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Watchlists</h1>
          <span className="badge badge-live">real prices only</span>
        </div>
        <form onSubmit={createWatchlist} className="flex gap-2">
          <input name="name" className="input !py-1.5 text-sm" placeholder="New watchlist…" required maxLength={60} />
          <button className="btn-primary !py-1.5 text-sm" disabled={busy}>+</button>
        </form>
        {watchlists.map((wl) => (
          <div key={wl.id} className="card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{wl.name} <span className="text-xs text-[var(--color-muted)]">({wl.items.length})</span></h3>
              <button className="ml-auto text-xs px-2 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-accent)]" onClick={() => loadPrices(wl.items.map((i) => i.symbol))}>↻ prices</button>
              <button className="text-xs text-[var(--color-loss)]" onClick={() => confirm(`Delete watchlist "${wl.name}"?`) && run(() => del(`/api/watchlists/${wl.id}`))}>✕</button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {wl.items.map((i) => {
                  const p = prices[i.symbol] ?? prices[i.symbol.toUpperCase()];
                  return (
                    <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-1.5 font-semibold">{i.symbol}</td>
                      <td className="py-1.5">
                        {p ? (
                          p.supported && p.price ? (
                            <span className="font-mono">{Number(p.price).toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
                          ) : (
                            <span className="badge badge-setup" title={p.reason}>{p.reason ? "unsupported (free tier)" : "unavailable"}</span>
                          )
                        ) : (
                          <span className="text-[var(--color-muted)]">↻ load</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {p?.source && (
                          <span className={`badge ${p.live ? "badge-live" : "badge-demo"}`}>{p.live ? `${p.source}` : `${p.source}`}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <button className="text-[var(--color-loss)]" onClick={() => run(() => del(`/api/items/${i.id}`))}>✕</button>
                      </td>
                    </tr>
                  );
                })}
                {wl.items.length === 0 && <tr><td className="py-3 text-[var(--color-muted)]" colSpan={4}>Empty — add symbols below.</td></tr>}
              </tbody>
            </table>
            <form onSubmit={(e) => addItem(wl, e)} className="flex gap-2">
              <input name="symbol" className="input !py-1 text-sm w-32" placeholder="e.g. BTCUSD, EURUSD" required />
              <input name="note" className="input !py-1 text-sm" placeholder="note (optional)" />
              <button className="btn-primary !py-1 text-sm" disabled={busy}>Add</button>
            </form>
          </div>
        ))}
        {pricesNote && <p className="text-xs text-[var(--color-muted)]">{pricesNote}</p>}
        <p className="text-xs text-[var(--color-muted)]">
          Supported on free tier: crypto pairs (Coinbase live spot) and major forex (ECB daily
          reference — marked delayed). Listed stocks/indices need a market-data key and honestly
          show “unsupported” instead of fake prices.
        </p>
      </section>

      {/* ---------------- alerts ---------------- */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Price Alerts</h1>
          <span className="badge badge-live">{activeAlerts.length} active</span>
          <button className="ml-auto btn-primary !py-1.5 text-sm" onClick={checkNow} disabled={busy}>
            {busy ? "Checking…" : "Check now (real prices)"}
          </button>
        </div>
        {checkMsg && <p className="text-xs text-[var(--color-profit)]">{checkMsg}</p>}
        <form onSubmit={createAlert} className="card p-4 grid grid-cols-2 gap-2 text-sm">
          <input name="symbol" className="input" placeholder="Symbol (e.g. BTCUSD)" required />
          <select name="condition" className="input"><option value="ABOVE">Crosses above ≥</option><option value="BELOW">Crosses below ≤</option></select>
          <input name="targetPrice" className="input" placeholder="Target price" required inputMode="decimal" />
          <input name="note" className="input" placeholder="note (optional)" />
          <button className="btn-primary col-span-2" disabled={busy}>Create alert</button>
        </form>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">Active</h3>
          <table className="w-full text-sm">
            <tbody>
              {activeAlerts.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 font-semibold">{a.symbol}</td>
                  <td className="py-2">{a.condition === "ABOVE" ? "≥" : "≤"} {Number(a.targetPrice).toLocaleString()}</td>
                  <td className="py-2 text-xs text-[var(--color-muted)]">{a.lastCheckedAt ? `checked ${new Date(a.lastCheckedAt).toLocaleTimeString()}` : "not checked yet"}</td>
                  <td className="py-2 text-right space-x-2">
                    <button className="text-xs text-amber-400" onClick={() => run(() => patch(`/api/alerts/${a.id}`, { active: false }))}>pause</button>
                    <button className="text-xs text-[var(--color-loss)]" onClick={() => run(() => del(`/api/alerts/${a.id}`))}>✕</button>
                  </td>
                </tr>
              ))}
              {activeAlerts.length === 0 && <tr><td className="py-3 text-[var(--color-muted)]">No active alerts.</td></tr>}
            </tbody>
          </table>
        </div>

        {doneAlerts.length > 0 && (
          <div className="card p-4">
            <h3 className="font-semibold mb-2">Triggered / paused</h3>
            <table className="w-full text-sm">
              <tbody>
                {doneAlerts.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 font-semibold">{a.symbol}</td>
                    <td className="py-2">{a.condition === "ABOVE" ? "≥" : "≤"} {Number(a.targetPrice).toLocaleString()}</td>
                    <td className="py-2">
                      {a.triggeredAt
                        ? <span className="badge badge-live">triggered at {a.triggeredPrice} · {new Date(a.triggeredAt).toLocaleString()}</span>
                        : <span className="badge badge-setup">paused</span>}
                    </td>
                    <td className="py-2 text-right space-x-2">
                      {!a.triggeredAt && <button className="text-xs text-[var(--color-profit)]" onClick={() => run(() => patch(`/api/alerts/${a.id}`, { active: true }))}>resume</button>}
                      <button className="text-xs text-[var(--color-loss)]" onClick={() => run(() => del(`/api/alerts/${a.id}`))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[var(--color-muted)]">
          Alerts fire only when a REAL fetched price crosses your target — never from
          demo/synthetic data. In this preview a checker runs continuously (and via “Check now”);
          in production it runs on a schedule (Vercel Cron → /api/cron/alerts). Fired alerts also
          create a notification (🔔 in the top bar).
        </p>
      </section>
    </div>
  );
}
