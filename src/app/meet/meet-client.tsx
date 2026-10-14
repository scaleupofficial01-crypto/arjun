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
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<string | null>(null);

  function onEnter(e: React.FormEvent) {
    e.preventDefault();
    const name = room.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(name)) {
      setError("Meeting code: 3-64 chars — sirf letters/numbers/- aur _");
      return;
    }
    setError(null);
    setEntered(name);
  }

  if (entered) {
    return (
      <LiveKitStage
        room={entered}
        lkConfigured={lkConfigured}
        defaultName={defaultName}
        onLeave={() => setEntered(null)}
      />
    );
  }

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16">
      <div className="card w-full max-w-md p-8 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">
            <span className="text-[var(--color-accent)]">Empire</span> Meet
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Google Meet jaisa flow: meeting code daalo → lobby me camera/mic check → Join.
            Sab in-app, koi external link nahi.
          </p>
        </div>

        {!lkConfigured && (
          <div className="badge badge-setup w-full justify-center py-2">
            Setup required — server env me LIVEKIT_API_SECRET abhi baaki hai (key/url set hai).
          </div>
        )}

        <form onSubmit={onEnter} className="space-y-4">
          <input
            className="input text-center tracking-wide font-mono"
            name="room"
            placeholder="meeting code (e.g., desk-live)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={!lkConfigured}
            autoComplete="off"
            required
          />
          {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
          <button className="btn-primary w-full" disabled={!lkConfigured} type="submit">
            Continue
          </button>
        </form>
        <p className="text-[11px] text-center text-[var(--color-muted)]">
          Joining as <span className="text-white">{defaultName}</span>
        </p>
      </div>
    </main>
  );
}
