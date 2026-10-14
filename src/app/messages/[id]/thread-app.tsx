"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; text: string; at: string; senderId: string; senderName: string; mine: boolean };
type Conv = { id: string; isGroup: boolean; name: string | null; members: { id: string; name: string; imageUrl: string | null }[] };

export default function ThreadApp({ conversationId }: { conversationId: string }) {
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  async function load() {
    try {
      const r = await fetch(`/api/messages/${conversationId}`);
      const d = (await r.json()) as { conversation?: Conv; messages?: Msg[] };
      if (d.conversation) setConv(d.conversation);
      if (d.messages) {
        setMsgs(d.messages);
        if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
      }
    } catch {
      setErr("Failed to load — retrying automatically");
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000); // poll; honest live-ish (no realtime infra)
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    stickRef.current = true;
    try {
      const r = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      if (r.ok) {
        setText("");
        await load();
      } else {
        const d = (await r.json()) as { error?: string };
        setErr(d.error ?? "Send failed");
      }
    } finally {
      setSending(false);
    }
  }

  const title = conv ? (conv.isGroup ? conv.name ?? `Group (${conv.members.length})` : conv.members.map((m) => m.name).join(", ")) : "…";

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-3.25rem)]">
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
        <span className="text-sm font-semibold">{title}</span>
        {conv && <span className="text-[11px] text-[var(--color-muted)]">{conv.members.length} member(s)</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}>
        {msgs.length === 0 && <p className="text-xs text-[var(--color-muted)] text-center py-6">Send the first message 👋</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.mine ? "bg-[#f59e0b] text-[#0a0f1a]" : "card"}`}>
              {!m.mine && <p className="text-[10px] font-semibold opacity-70">{m.senderName}</p>}
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`text-[9px] mt-0.5 ${m.mine ? "text-[#0a0f1a99]" : "text-[var(--color-muted)]"}`}>
                {new Date(m.at).toLocaleString("en-IN", { hour12: false })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {err && <p className="px-5 text-xs text-[var(--color-loss)]">{err}</p>}
      <form onSubmit={(e) => void send(e)} className="px-5 py-3 border-t border-[var(--color-border)] flex gap-2">
        <input
          className="input"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          autoComplete="off"
        />
        <button className="btn-primary px-5" disabled={sending || !text.trim()} type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
