"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; members: number; last: string; at: string | null; hasUnreadMarker: boolean };
type Found = { id: string; displayName: string; email: string; imageUrl: string | null };

export default function MessagesApp({ items }: { items: Item[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/messages/users?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as { users?: Found[] };
        setResults(d.users ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function startChat(userId: string) {
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    });
    const d = (await r.json()) as { conversationId?: string };
    if (d.conversationId) router.push(`/messages/${d.conversationId}`);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Start a chat</h3>
        <input
          className="input"
          placeholder="Empire user ka naam ya email likho…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {searching && results.length === 0 && <p className="text-xs text-[var(--color-muted)]">searching…</p>}
        {!searching && results.length === 0 && q.trim() && (
          <p className="text-xs text-[var(--color-muted)]">koi user nahi mila</p>
        )}
        {results.length > 0 && (
          <div className="divide-y divide-[var(--color-border)]">
            {results.map((u) => (
              <button
                key={u.id}
                className="w-full text-left py-2 px-2 hover:bg-[var(--color-panel-2)] rounded-md"
                onClick={() => void startChat(u.id)}
              >
                <span className="text-sm font-medium">{u.displayName}</span>
                <span className="text-xs text-[var(--color-muted)] ml-2">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Your conversations</h3>
        {items.length === 0 && (
          <div className="card p-5 text-sm text-[var(--color-muted)]">
            Abhi koi chat nahi — upar se kisi Empire user se shuru karo. Sab members-only, kuch public nahi.
          </div>
        )}
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/messages/${it.id}`}
            className="card block p-4 hover:border-[var(--color-accent)] transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{it.title}</span>
              {it.hasUnreadMarker && <span className="badge badge-live">new</span>}
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-1 truncate">{it.last}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">
              {it.members} member{it.members === 1 ? "" : "s"}
              {it.at ? ` · ${new Date(it.at).toLocaleString("en-IN", { hour12: false })}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
