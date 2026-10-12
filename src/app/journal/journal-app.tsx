"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Group { id: string; name: string; tradeCount: number }
interface Journal { id: string; name: string; tradeCount: number; groups: Group[] }
interface Attachment { id: string; fileName: string; mime: string; size: number; path: string }
interface Trade {
  id: string; journalId: string; groupId: string | null; symbol: string; side: string;
  entryPrice: string; exitPrice: string | null; quantity: string; risk: string | null;
  fees: string; pnl: string | null; status: string; setupTag: string | null; notes: string | null;
  entryAt: string; exitAt: string | null; attachments: Attachment[];
}

type ApiData = { error?: string } & Record<string, unknown>;
async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: ApiData }> {
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as ApiData;
  return { ok: res.ok, status: res.status, data };
}
const jsonPost = (path: string, body: unknown) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const jsonPatch = (path: string, body: unknown) =>
  api(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = (path: string) => api(path, { method: "DELETE" });

function fmt(v: string | null, digits = 2): string {
  if (v === null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function pnlClass(v: string | null): string {
  if (v === null) return "text-[var(--color-muted)]";
  const n = Number(v);
  return n > 0 ? "text-[var(--color-profit)]" : n < 0 ? "text-[var(--color-loss)]" : "text-[var(--color-muted)]";
}

export default function JournalApp({
  journals, selectedJournalId, selectedGroupId, trades,
}: {
  journals: Journal[]; selectedJournalId: string | null; selectedGroupId: string | null; trades: Trade[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [openAttachTrade, setOpenAttachTrade] = useState<string | null>(null);

  const journal = journals.find((x) => x.id === selectedJournalId) ?? null;

  function nav(j: string | null, g: string | null) {
    const q = new URLSearchParams();
    if (j) q.set("j", j);
    if (g) q.set("g", g);
    router.push(`/journal?${q.toString()}`);
  }
  function refresh() { router.refresh(); }
  async function run(fn: () => Promise<{ ok: boolean; data: ApiData }>, errFallback: string) {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.data.error ?? errFallback); return false; }
    refresh();
    return true;
  }

  // ---------- journal + group mutations ----------
  async function createJournal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    if (await run(() => jsonPost("/api/journals", { name }), "Create failed")) {
      (e.target as HTMLFormElement).reset();
    }
  }
  async function deleteJournal(id: string, name: string) {
    if (!confirm(`Delete journal "${name}" with ALL its entries? This cannot be undone.`)) return;
    await run(() => del(`/api/journals/${id}`), "Delete failed");
  }
  async function createGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name || !journal) return;
    if (await run(() => jsonPost(`/api/journals/${journal.id}/groups`, { name }), "Create failed")) {
      (e.target as HTMLFormElement).reset();
    }
  }
  async function deleteGroup(id: string, mode: string, label: string) {
    if (!confirm(label)) return;
    await run(() => del(`/api/groups/${id}?mode=${mode}`), "Delete failed");
  }

  // ---------- trade mutations ----------
  async function addTrade(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!journal) return;
    const fd = new FormData(e.currentTarget);
    const body = {
      journalId: journal.id,
      groupId: selectedGroupId ?? null,
      symbol: fd.get("symbol"), side: fd.get("side"),
      entryPrice: fd.get("entryPrice"), exitPrice: fd.get("exitPrice") || null,
      quantity: fd.get("quantity"), risk: fd.get("risk") || null,
      fees: fd.get("fees") || null,
      entryAt: fd.get("entryAt") ? new Date(String(fd.get("entryAt"))).toISOString() : null,
      exitAt: fd.get("exitAt") ? new Date(String(fd.get("exitAt"))).toISOString() : null,
      setupTag: fd.get("setupTag") || null, notes: fd.get("notes") || null,
    };
    if (await run(() => jsonPost("/api/trades", body), "Add failed")) {
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
    }
  }
  async function saveEdit(e: React.FormEvent<HTMLFormElement>, t: Trade) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      symbol: fd.get("symbol"), side: fd.get("side"),
      entryPrice: fd.get("entryPrice"), exitPrice: fd.get("exitPrice") || null,
      quantity: fd.get("quantity"), risk: fd.get("risk") || null,
      fees: fd.get("fees") || null,
      exitAt: fd.get("exitAt") ? new Date(String(fd.get("exitAt"))).toISOString() : null,
      setupTag: fd.get("setupTag") || null, notes: fd.get("notes") || null,
      groupId: fd.get("group") || null,
    };
    if (await run(() => jsonPatch(`/api/trades/${t.id}`, body), "Save failed")) setEditId(null);
  }
  async function deleteTrade(id: string) {
    if (!confirm("Delete this entry?")) return;
    await run(() => del(`/api/trades/${id}`), "Delete failed");
  }
  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !journal) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true); setError(null);
    const r = await api(`/api/journals/${journal.id}/import`, { method: "POST", body: fd });
    setBusy(false);
    if (!r.ok) setError(r.data.error ?? "Import failed");
    else {
      const gname = (r.data.group as { name?: string } | undefined)?.name ?? "Import";
      alert(`Imported ${Number(r.data.imported ?? 0)} trades (${Number(r.data.skipped ?? 0)} skipped) into group "${gname}"`);
    }
    e.target.value = "";
    refresh();
  }
  async function uploadShot(tradeId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const r = await api(`/api/trades/${tradeId}/attachments`, { method: "POST", body: fd });
    if (!r.ok) setError(r.data.error ?? "Upload failed");
    e.target.value = "";
    refresh();
  }

  const totalPnl = trades.reduce((a, t) => a + (t.pnl ? Number(t.pnl) : 0), 0);

  return (
    <div className="max-w-7xl mx-auto p-6 grid lg:grid-cols-[260px_1fr] gap-6">
      {/* -------- sidebar: journals + groups -------- */}
      <aside className="space-y-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-2">Journals</h3>
          <div className="space-y-1">
            {journals.map((jn) => (
              <div key={jn.id} className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${jn.id === selectedJournalId ? "bg-[var(--color-panel-2)] text-[var(--color-accent)]" : "hover:bg-[var(--color-panel-2)]"}`}>
                <button className="text-left flex-1 truncate" onClick={() => nav(jn.id, null)}>{jn.name} <span className="text-[var(--color-muted)]">({jn.tradeCount})</span></button>
                <button title="Delete journal" className="text-[var(--color-loss)] px-1" onClick={() => deleteJournal(jn.id, jn.name)}>✕</button>
              </div>
            ))}
          </div>
          <form onSubmit={createJournal} className="mt-3 flex gap-1">
            <input name="name" className="input !py-1.5 text-sm" placeholder="New journal…" required maxLength={80} />
            <button className="btn-primary !py-1.5 !px-3 text-sm" disabled={busy}>+</button>
          </form>
        </div>

        {journal && (
          <div className="card p-4">
            <h3 className="font-semibold mb-2">Groups</h3>
            <div className="space-y-1 text-sm">
              <button className={`block w-full text-left rounded px-2 py-1.5 ${!selectedGroupId ? "bg-[var(--color-panel-2)] text-[var(--color-accent)]" : "hover:bg-[var(--color-panel-2)]"}`} onClick={() => nav(journal.id, null)}>All entries</button>
              {journal.groups.map((gr) => (
                <div key={gr.id} className={`flex items-center justify-between rounded px-2 py-1.5 ${gr.id === selectedGroupId ? "bg-[var(--color-panel-2)] text-[var(--color-accent)]" : "hover:bg-[var(--color-panel-2)]"}`}>
                  <button className="text-left flex-1 truncate" onClick={() => nav(journal.id, gr.id)}>{gr.name} ({gr.tradeCount})</button>
                  <span className="flex gap-1 text-xs">
                    <button title="Delete entries in group" className="text-amber-400" onClick={() => deleteGroup(gr.id, "trades", `Delete ALL ${gr.tradeCount} entries in "${gr.name}"? Group stays.`)}>🧹</button>
                    <button title="Delete group" className="text-[var(--color-loss)]" onClick={() => deleteGroup(gr.id, "group-with-trades", `Delete group "${gr.name}" AND all its entries?`)}>✕</button>
                  </span>
                </div>
              ))}
            </div>
            <form onSubmit={createGroup} className="mt-3 flex gap-1">
              <input name="name" className="input !py-1.5 text-sm" placeholder="New group…" required maxLength={80} />
              <button className="btn-primary !py-1.5 !px-3 text-sm" disabled={busy}>+</button>
            </form>
          </div>
        )}
      </aside>

      {/* -------- main: trades table -------- */}
      <section className="space-y-4">
        {error && <div className="card p-3 border-[var(--color-loss)] text-sm text-[var(--color-loss)]">{error}</div>}
        {!journal && (
          <div className="card p-8 text-center text-[var(--color-muted)]">Create your first journal from the sidebar to start logging trades.</div>
        )}
        {journal && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold">{journal.name}</h2>
              <span className={`badge ${totalPnl >= 0 ? "badge-live" : "badge-setup"}`}>
                Net P&L (shown entries): {fmt(String(totalPnl))}
              </span>
              <div className="ml-auto flex gap-2 flex-wrap">
                <button className="btn-primary text-sm !py-1.5" onClick={() => setShowForm((v) => !v)}>+ Add trade</button>
                <a className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]" href={`/api/journals/${journal.id}/export?format=csv`}>⬇ CSV</a>
                <a className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]" href={`/api/journals/${journal.id}/export?format=xlsx`}>⬇ Excel</a>
                <label className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] cursor-pointer">
                  ⬆ Import
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={importFile} />
                </label>
              </div>
            </div>

            {showForm && (
              <form onSubmit={addTrade} className="card p-4 grid sm:grid-cols-4 gap-3 text-sm">
                <input name="symbol" className="input" placeholder="Symbol (e.g. BTCUSD)" required />
                <select name="side" className="input"><option value="BUY">BUY / Long</option><option value="SELL">SELL / Short</option></select>
                <input name="entryPrice" className="input" placeholder="Entry price" required inputMode="decimal" />
                <input name="exitPrice" className="input" placeholder="Exit price (blank = open)" inputMode="decimal" />
                <input name="quantity" className="input" placeholder="Quantity" required inputMode="decimal" />
                <input name="risk" className="input" placeholder="Risk ($)" inputMode="decimal" />
                <input name="fees" className="input" placeholder="Fees ($)" inputMode="decimal" />
                <input name="setupTag" className="input" placeholder="Setup / strategy tag" />
                <label className="text-[var(--color-muted)] text-xs sm:col-span-2">Entry time<input name="entryAt" type="datetime-local" className="input mt-1" /></label>
                <label className="text-[var(--color-muted)] text-xs sm:col-span-2">Exit time<input name="exitAt" type="datetime-local" className="input mt-1" /></label>
                <input name="notes" className="input sm:col-span-4" placeholder="Notes" />
                <div className="sm:col-span-4 flex gap-2">
                  <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save trade"}</button>
                  <button type="button" className="px-4 py-2 rounded-lg border border-[var(--color-border)]" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
              </form>
            )}

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <th className="p-3">Symbol</th><th className="p-3">Side</th><th className="p-3">Entry</th>
                    <th className="p-3">Exit</th><th className="p-3">Qty</th><th className="p-3">Risk</th>
                    <th className="p-3">P&L</th><th className="p-3">Status</th><th className="p-3">Setup</th>
                    <th className="p-3">Closed</th><th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    editId === t.id ? (
                      <tr key={t.id} className="border-b border-[var(--color-border)] bg-[var(--color-panel-2)]">
                        <td colSpan={11} className="p-3">
                          <form onSubmit={(e) => saveEdit(e, t)} className="grid sm:grid-cols-5 gap-2">
                            <input name="symbol" className="input" defaultValue={t.symbol} required />
                            <select name="side" className="input" defaultValue={t.side}><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
                            <input name="entryPrice" className="input" defaultValue={t.entryPrice} required />
                            <input name="exitPrice" className="input" defaultValue={t.exitPrice ?? ""} placeholder="blank = open" />
                            <input name="quantity" className="input" defaultValue={t.quantity} required />
                            <input name="risk" className="input" defaultValue={t.risk ?? ""} />
                            <input name="fees" className="input" defaultValue={t.fees} />
                            <select name="group" className="input" defaultValue={t.groupId ?? ""}>
                              <option value="">Ungrouped</option>
                              {journal.groups.map((gr) => <option key={gr.id} value={gr.id}>{gr.name}</option>)}
                            </select>
                            <input name="exitAt" type="datetime-local" className="input" />
                            <input name="setupTag" className="input" defaultValue={t.setupTag ?? ""} placeholder="Setup" />
                            <input name="notes" className="input sm:col-span-3" defaultValue={t.notes ?? ""} placeholder="Notes" />
                            <div className="flex gap-2 sm:col-span-5">
                              <button className="btn-primary !py-1.5" disabled={busy}>Save</button>
                              <button type="button" className="px-3 py-1.5 rounded-lg border border-[var(--color-border)]" onClick={() => setEditId(null)}>Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={t.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-panel-2)]">
                        <td className="p-3 font-semibold">{t.symbol}</td>
                        <td className={`p-3 ${t.side === "BUY" ? "text-[var(--color-profit)]" : "text-[var(--color-loss)]"}`}>{t.side}</td>
                        <td className="p-3">{fmt(t.entryPrice, 8)}</td>
                        <td className="p-3">{fmt(t.exitPrice, 6)}</td>
                        <td className="p-3">{fmt(t.quantity, 6)}</td>
                        <td className="p-3">{fmt(t.risk)}</td>
                        <td className={`p-3 font-semibold ${pnlClass(t.pnl)}`}>{fmt(t.pnl)}</td>
                        <td className="p-3"><span className={`badge ${t.status === "OPEN" ? "badge-setup" : "badge-live"}`}>{t.status}</span></td>
                        <td className="p-3 text-[var(--color-muted)]">{t.setupTag ?? "—"}</td>
                        <td className="p-3 text-[var(--color-muted)]">{t.exitAt ? new Date(t.exitAt).toLocaleDateString() : "—"}</td>
                        <td className="p-3 whitespace-nowrap">
                          <button className="px-1" title="Edit" onClick={() => setEditId(t.id)}>✏️</button>
                          <button className="px-1" title="Screenshots/notes" onClick={() => setOpenAttachTrade(openAttachTrade === t.id ? null : t.id)}>📎{t.attachments.length > 0 ? t.attachments.length : ""}</button>
                          <button className="px-1" title="Delete" onClick={() => deleteTrade(t.id)}>🗑️</button>
                        </td>
                      </tr>
                    )
                  ))}
                  {trades.length === 0 && (
                    <tr><td colSpan={11} className="p-8 text-center text-[var(--color-muted)]">No entries yet — add a trade or import a CSV/Excel file.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {openAttachTrade && (
              <AttachmentPanel
                trade={trades.find((t) => t.id === openAttachTrade)!}
                onUpload={uploadShot}
                onClose={() => setOpenAttachTrade(null)}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AttachmentPanel({ trade, onUpload, onClose }: {
  trade: Trade;
  onUpload: (tradeId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="card p-4 text-sm space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Attachments — {trade.symbol} ({trade.side})</h4>
        <button onClick={onClose} className="text-[var(--color-muted)]">✕ close</button>
      </div>
      {trade.notes && <p className="text-[var(--color-muted)]">Notes: {trade.notes}</p>}
      <div className="flex flex-wrap gap-3">
        {trade.attachments.map((a) => (
          <a key={a.id} href={`/api/files/${a.path}`} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${a.path}`} alt={a.fileName} className="h-24 rounded border border-[var(--color-border)] object-cover" />
          </a>
        ))}
        {trade.attachments.length === 0 && <p className="text-[var(--color-muted)]">No screenshots yet.</p>}
      </div>
      <label className="inline-block px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] cursor-pointer">
        + Upload screenshot
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onUpload(trade.id, e)} />
      </label>
    </div>
  );
}
