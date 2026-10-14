"use client";

import { useCallback, useEffect, useState } from "react";
import TradeMap from "./trade-map";
import EquityChart from "./equity-chart";
import { buildRoundTrips } from "@/lib/trade-map";

interface Account {
  id: string; label: string; login: string; server: string; currency: string;
  balance: string | null; equity: string | null; lastSyncAt: string | null; createdAt: string;
  positions?: number; deals?: number;
}
interface Position { ticket: string; symbol: string; side: string; volume: string; openPrice: string; openAt: string; profit: string | null; }
interface Deal { ticket: string; positionId: string; symbol: string; side: string; entry: string; volume: string; price: string; profit: string; commission: string; swap: string; dealtAt: string; imported: boolean; }
interface Journal { id: string; name: string; }

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => null)) as T & { error?: string };
    return res.ok ? { ok: true, data: body } : { ok: false, data: null, error: body?.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, data: null, error: "network error" };
  }
}

/** Step-by-step REAL terminal connection checklist (live origin + copy). */
function ConnectGuide({ ingestUrl, appUrl }: { ingestUrl: string; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const origin = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return (
    <div className="card p-4 border-[var(--color-accent)]/50 space-y-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="font-semibold text-sm">🖥️ Connect your REAL MT5 terminal — live checklist</span>
        <span className="text-[var(--color-muted)] text-xs">{open ? "hide ▲" : "show ▼"}</span>
      </button>
      {open && (
        <ol className="text-xs text-[var(--color-muted)] list-decimal ml-5 space-y-1.5">
          <li>MT5 open karo (demo ya real — dono chalenge; bridge read-only hai, trade place karna <b>impossible</b> hai).</li>
          <li>Tools → Options → <b>Expert Advisors</b> → tick <i>“Allow WebRequest for listed URL”</i> → add exactly:
            <div className="flex items-center gap-2 mt-1">
              <code className="px-2 py-0.5 rounded bg-black/40 text-[var(--color-accent)] select-all">{origin}</code>
              <button className="text-[var(--color-accent)] underline" onClick={() => navigator.clipboard.writeText(origin)}>copy</button>
            </div>
          </li>
          <li>Download <a className="text-[var(--color-accent)] underline" href="/empire_bridge.mq5" download>empire_bridge.mq5</a> → copy into <code>MQL5/Experts</code> → MetaEditor me kholo → <b>F7 compile</b>.</li>
          <li>Chart pe EA drag karo. Inputs: <code>IngestUrl</code> =
            <code className="px-1 rounded bg-black/40 text-[var(--color-accent)] break-all">{ingestUrl}</code>
            {" "}<button className="text-[var(--color-accent)] underline" onClick={() => navigator.clipboard.writeText(ingestUrl)}>copy</button>
            aur <code>IngestToken</code> = account-register karte waqt mila <code>mt5_…</code> token.</li>
          <li>Algo Trading ON → within a minute ye page <b>“synced (live)”</b> ho jayega — ingest sirf us token ke account-number se match hone pe hi accept hota hai, isliye “live terminal” proof hai, koi simulation nahi.</li>
        </ol>
      )}
    </div>
  );
}

export default function Mt5App({ appUrl }: { appUrl: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ token: string; accountId: string } | null>(null);
  const [detail, setDetail] = useState<{ account: Account; positions: Position[]; deals: Deal[] } | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call<{ accounts: Account[] }>("/api/mt5/accounts");
    if (r.ok && r.data) {
      setAccounts(r.data.accounts);
      // UX: auto-open the most recently synced account's details so users
      // land straight on live positions/deals + trade map.
      const synced = r.data.accounts.find((a) => a.lastSyncAt);
      if (synced) void openDetail(synced.id);
    }
    const j = await call<{ journals: Journal[] }>("/api/journals");
    if (j.ok && j.data) setJournals(j.data.journals);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ingestUrl = `${appUrl || (typeof window !== "undefined" ? window.location.origin : "")}/api/mt5/ingest`;

  async function addAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    const f = new FormData(e.currentTarget);
    const r = await call<{ account: Account; ingestToken: string }>("/api/mt5/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: f.get("label"), login: f.get("login"), server: f.get("server"), currency: f.get("currency") }),
    });
    setBusy(false);
    if (!r.ok || !r.data) { setErr(r.error ?? "failed"); return; }
    setReveal({ token: r.data.ingestToken, accountId: r.data.account.id });
    (e.target as HTMLFormElement).reset();
    void load();
  }

  async function rotate(id: string) {
    if (!confirm("Rotate token? The old one stops working NOW — you must update the EA inputs.")) return;
    const r = await call<{ ingestToken: string }>(`/api/mt5/accounts/${id}/rotate`, { method: "POST" });
    if (r.ok && r.data) setReveal({ token: r.data.ingestToken, accountId: id });
  }

  async function remove(id: string) {
    if (!confirm("Delete this MT5 account and all its synced data?")) return;
    await call(`/api/mt5/accounts/${id}`, { method: "DELETE" });
    setDetail(null);
    void load();
  }

  async function openDetail(id: string) {
    const r = await call<{ account: Account; positions: Position[]; deals: Deal[] }>(`/api/mt5/accounts/${id}`);
    if (r.ok && r.data) setDetail(r.data);
  }

  async function doImport(accountId: string, journalId: string) {
    setBusy(true); setMsg(null); setErr(null);
    const r = await call<{ imported: number; skipped: number; candidates: number }>(
      `/api/mt5/accounts/${accountId}/import`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journalId }) },
    );
    setBusy(false);
    if (!r.ok || !r.data) { setErr(r.error ?? "import failed"); return; }
    setMsg(`Imported ${r.data.imported} trade(s) into the journal (${r.data.skipped} already imported, ${r.data.candidates} closed round-trips found). pnl recomputed server-side.`);
    setImportFor(null);
    void openDetail(accountId);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">MT5 Sync</h1>
        <span className="badge badge-live">read-only bridge</span>
        <span className="badge badge-demo">no passwords stored — ever</span>
      </div>

      <div className="card p-4 text-xs text-[var(--color-muted)] space-y-1">
        <p><b className="text-white">How it works:</b> Your MT5 login/password never leaves your PC. A tiny EA (<a className="text-[var(--color-accent)] underline" href="/empire_bridge.mq5" download>empire_bridge.mq5</a>) running in your terminal reads account data and pushes it here with a scoped per-account token.</p>
        <p><b className="text-white">Honest status:</b> until an EA actually connects, every account shows “waiting for first sync” — nothing here is simulated.</p>
      </div>

      <ConnectGuide ingestUrl={ingestUrl} appUrl={appUrl} />

      {msg && <div className="card p-3 text-sm text-[var(--color-profit)]">{msg}</div>}
      {err && <div className="card p-3 text-sm text-[var(--color-loss)]">{err}</div>}

      {reveal && (
        <div className="card p-4 space-y-2 border-[var(--color-accent)]">
          <h3 className="font-semibold">Save this ingest token — shown ONCE</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <code className="px-2 py-1 rounded bg-black/40 text-[var(--color-accent)] text-sm select-all">{reveal.token}</code>
            <button className="btn-primary !py-1 text-xs" onClick={() => navigator.clipboard.writeText(reveal.token)}>Copy</button>
            <button className="text-xs text-[var(--color-muted)] underline" onClick={() => setReveal(null)}>I saved it</button>
          </div>
          <ol className="text-xs text-[var(--color-muted)] list-decimal ml-5 space-y-1">
            <li>MT5 → Tools → Options → Expert Advisors → “Allow WebRequest for listed URL” → add <code>{appUrl || "your app origin"}</code></li>
            <li>Copy <a className="text-[var(--color-accent)] underline" href="/empire_bridge.mq5" download>empire_bridge.mq5</a> into <code>MQL5/Experts</code>, compile in MetaEditor</li>
            <li>Attach to any chart. Inputs: <code>IngestUrl = {ingestUrl}</code>, <code>IngestToken = the token above</code></li>
            <li>First sync arrives within a minute — this page will light up.</li>
          </ol>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Add MT5 account</h2>
        <form onSubmit={addAccount} className="flex flex-wrap gap-2">
          <input name="label" required maxLength={60} placeholder="Label (e.g. IC demo)" className="input !py-1.5 w-44" />
          <input name="login" required pattern="\d{4,16}" title="MT5 account number (digits only)" placeholder="Login (number)" className="input !py-1.5 w-36" />
          <input name="server" required maxLength={64} placeholder="Server (e.g. ICMarkets-Demo)" className="input !py-1.5 w-52" />
          <input name="currency" maxLength={3} placeholder="USD" className="input !py-1.5 w-20" defaultValue="USD" />
          <button disabled={busy} className="btn-primary !py-1.5 text-sm">{busy ? "…" : "Register & get token"}</button>
        </form>
        <p className="text-xs text-[var(--color-muted)] mt-2">Only public metadata (account number + server) is stored. No password fields exist here by design.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((a) => (
          <div key={a.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{a.label}</h3>
              {a.lastSyncAt
                ? <span className="badge badge-live">synced {new Date(a.lastSyncAt).toLocaleString()}</span>
                : <span className="badge badge-setup">waiting for first sync</span>}
            </div>
            <p className="text-xs text-[var(--color-muted)]">{a.login} @ {a.server} · {a.currency}</p>
            <p className="text-sm">
              balance {a.balance ?? "—"} · equity {a.equity ?? "—"} · {a.positions ?? 0} open · {a.deals ?? 0} deals
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => openDetail(a.id)} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">Details</button>
              <button onClick={() => setImportFor(importFor === a.id ? null : a.id)} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">Import to journal</button>
              <button onClick={() => rotate(a.id)} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">Rotate token</button>
              <button onClick={() => remove(a.id)} className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)]">Delete</button>
            </div>
            {importFor === a.id && (
              <div className="flex gap-2 items-center pt-2 border-t border-[var(--color-border)]">
                <select id={`j-${a.id}`} className="input !py-1 text-xs w-52">
                  {journals.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <button
                  disabled={busy || journals.length === 0}
                  onClick={() => doImport(a.id, (document.getElementById(`j-${a.id}`) as HTMLSelectElement).value)}
                  className="btn-primary !py-1 text-xs"
                >
                  {busy ? "…" : "Import closed round-trips"}
                </button>
              </div>
            )}
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="card p-6 text-sm text-[var(--color-muted)]">No MT5 accounts yet — register one above to get its ingest token.</div>
        )}
      </div>

      {detail && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{detail.account.label} — details</h2>
            <button onClick={() => setDetail(null)} className="text-xs text-[var(--color-muted)] underline">close</button>
          </div>
          <h3 className="text-sm font-medium text-[var(--color-accent)]">Open positions ({detail.positions.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--color-muted)] text-left"><tr><th className="py-1">Ticket</th><th>Symbol</th><th>Side</th><th>Vol</th><th>Open price</th><th>Opened (UTC)</th><th>Float P&L</th></tr></thead>
              <tbody>
                {detail.positions.map((p) => (
                  <tr key={p.ticket} className="border-t border-[var(--color-border)]">
                    <td className="py-1">#{p.ticket}</td><td>{p.symbol}</td><td className={p.side === "BUY" ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}>{p.side}</td>
                    <td>{p.volume}</td><td>{p.openPrice}</td><td>{new Date(p.openAt).toLocaleString()}</td>
                    <td className={Number(p.profit ?? 0) >= 0 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}>{p.profit ?? "—"}</td>
                  </tr>
                ))}
                {detail.positions.length === 0 && <tr><td colSpan={7} className="py-2 text-[var(--color-muted)]">No open positions reported.</td></tr>}
              </tbody>
            </table>
          </div>
          <h3 className="text-sm font-medium text-[var(--color-accent)]">Chart — your trades on real market candles</h3>
          <TradeMap accountId={detail.account.id} deals={detail.deals.map((d) => ({ ...d, dealtAt: String(d.dealtAt) }))} />

          {(() => {
            const deals = detail.deals.map((d) => ({ ...d, dealtAt: String(d.dealtAt) }));
            const trips = buildRoundTrips(deals);
            const fmtT = (s: string) => {
              const d = new Date(s);
              const p = (n: number) => String(n).padStart(2, "0");
              return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
            };
            const money = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
            return (
              <>
                <h3 className="text-sm font-medium text-[var(--color-accent)]">History — closed trades ({trips.length})</h3>
                <p className="text-[10px] text-[var(--color-muted)]">MT5 History-tab style: one clean row per round-trip. Commission, swap and profit are as reported by your terminal. SL/TP columns nehi dikha rahe — woh data EA se aata hi nehi.</p>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[var(--color-muted)] text-left">
                      <tr>
                        <th className="py-1 px-2 whitespace-nowrap">Open time</th><th>Position</th><th>Symbol</th><th>Type</th><th className="py-1 px-2 text-right whitespace-nowrap">Vol</th>
                        <th className="py-1 px-2 text-right whitespace-nowrap">Open price</th><th>Close time</th><th className="py-1 px-2 text-right whitespace-nowrap">Close price</th>
                        <th className="py-1 px-2 text-right whitespace-nowrap">Comm</th><th className="py-1 px-2 text-right whitespace-nowrap">Swap</th><th className="py-1 px-2 text-right whitespace-nowrap">Profit</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map((t, i) => (
                        <tr key={t.positionId} className={`border-t border-[var(--color-border)] ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                          <td className="py-1 px-2 whitespace-nowrap">{fmtT(t.openTime)}</td>
                          <td className="px-2 text-[var(--color-muted)]">#{t.positionId}</td>
                          <td className="px-2">{t.symbol}</td>
                          <td className={t.side === "BUY" ? "px-2 text-[var(--color-profit)]" : "px-2 text-[var(--color-loss)]"}>{t.side}</td>
                          <td className="py-1 px-2 text-right">{(Math.round(t.volume * 100) / 100).toString()}</td>
                          <td className="py-1 px-2 text-right">{t.openPrice}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{fmtT(t.closeTime)}</td>
                          <td className="py-1 px-2 text-right">{t.closePrice}</td>
                          <td className="text-right px-2 text-[var(--color-muted)]">{t.commission === 0 ? "0.00" : t.commission.toFixed(2)}</td>
                          <td className="text-right px-2 text-[var(--color-muted)]">{t.swap === 0 ? "0.00" : t.swap.toFixed(2)}</td>
                          <td className={`text-right px-2 font-medium ${t.win ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}`}>{money(t.profit)}</td>
                          <td className="px-2">{t.inJournal && <span className="badge badge-live">in journal</span>}</td>
                        </tr>
                      ))}
                      {trips.length === 0 && <tr><td colSpan={12} className="py-2 text-[var(--color-muted)]">No closed trades yet — jab trade close hoga, terminal sync ke baad yahan history banegi.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <EquityChart deals={deals} />

                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--color-muted)]">Raw deals ({deals.length}) — technical/audit view</summary>
                  <div className="overflow-x-auto max-h-60 overflow-y-auto mt-2">
                    <table className="w-full text-xs">
                      <thead className="text-[var(--color-muted)] text-left"><tr><th className="py-1">Ticket</th><th>Symbol</th><th>Entry</th><th>Side</th><th>Vol</th><th>Price</th><th>Profit</th><th>Time (UTC)</th><th></th></tr></thead>
                      <tbody>
                        {deals.map((d) => (
                          <tr key={d.ticket} className="border-t border-[var(--color-border)]">
                            <td className="py-1">#{d.ticket}</td><td>{d.symbol}</td><td>{d.entry}</td><td>{d.side}</td>
                            <td>{d.volume}</td><td>{d.price}</td>
                            <td className={Number(d.profit) >= 0 ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}>{d.profit}</td>
                            <td>{fmtT(d.dealtAt)}</td>
                            <td>{d.imported && <span className="badge badge-live">in journal</span>}</td>
                          </tr>
                        ))}
                        {deals.length === 0 && <tr><td colSpan={9} className="py-2 text-[var(--color-muted)]">No deals synced yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
