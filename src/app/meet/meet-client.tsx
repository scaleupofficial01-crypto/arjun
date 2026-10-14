"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// LiveKit SDK is browser-only; load the stage strictly client-side.
const LiveKitStage = dynamic(() => import("./livekit-stage"), { ssr: false });

export default function MeetClient({
  lkConfigured,
  defaultName,
}: {
  lkConfigured: boolean;
  defaultName: string;
}) {
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [join, setJoin] = useState<{ token: string; url: string; room: string } | null>(null);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = room.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(name)) {
      setError("Room: 3-64 chars — sirf letters/numbers/- aur _");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/meet/token?room=${encodeURIComponent(name)}`);
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        url?: string;
        room?: string;
      };
      if (!r.ok || !data.token || !data.url || !data.room) {
        setError(
          r.status === 503
            ? "Meet abhi LiveKit keys ke bina setup-required hai (server env)."
            : data.error ?? "Token nahi ban saka",
        );
        return;
      }
      setJoin({ token: data.token, url: data.url, room: data.room });
    } finally {
      setBusy(false);
    }
  }

  if (join) {
    return (
      <LiveKitStage
        token={join.token}
        url={join.url}
        room={join.room}
        onLeave={() => setJoin(null)}
      />
    );
  }

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16">
      <div className="card w-full max-w-md p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            <span className="text-[var(--color-accent)]">Empire</span> Meet
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            In-app video room — camera, mic aur screen share, sab this window me. Koi
            external link nahi. Room name share karo — jisne bhi login kiya hai, wahi
            join kar sakta hai (2-hour security token, tumhari ID ke naam).
          </p>
        </div>

        {!lkConfigured && (
          <div className="badge badge-setup w-full justify-center py-2">
            Setup required — server env me LIVEKIT_API_KEY, LIVEKIT_API_SECRET aur
            NEXT_PUBLIC_LIVEKIT_URL chahiye (livekit.cloud free tier).
          </div>
        )}

        <form onSubmit={onJoin} className="space-y-4">
          <input
            className="input"
            name="room"
            placeholder="Room name (e.g., desk-live, team-demo)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={!lkConfigured}
            autoComplete="off"
            required
          />
          {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !lkConfigured} type="submit">
            {busy ? "Joining…" : "Join room"}
          </button>
        </form>
        <p className="text-[11px] text-[var(--color-muted)]">
          Joining as <span className="text-white">{defaultName}</span> — mic/camera browser
          permission mangna normal hai (video kabhi bhi off kar sakte ho).
        </p>
      </div>
    </main>
  );
}
