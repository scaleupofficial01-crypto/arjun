"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// LiveKit SDK is browser-only; load the stage strictly client-side.
const LiveKitStage = dynamic(() => import("./livekit-stage"), { ssr: false });

function newMeetingCode(): string {
  // Friendly 3-chunk code, e.g. empire-k4x2-8qpf — easy to read aloud.
  const words = ["sky", "trend", "bull", "apex", "iron", "nova", "mango", "tiger", "pixel", "orbit"];
  const chunk = () =>
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join("");
  const w = words[crypto.getRandomValues(new Uint8Array(1))[0] % words.length];
  return `meet-${w}-${chunk()}`;
}

export default function MeetClient({
  lkConfigured,
  defaultName,
}: {
  lkConfigured: boolean;
  defaultName: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<string | null>(null);

  function onEnter(e: React.FormEvent) {
    e.preventDefault();
    const name = code.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(name)) {
      setError("Code must be 3–64 characters: letters, numbers, hyphens or underscores.");
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
    <main className="flex flex-col items-center justify-center px-6 py-14">
      <div className="w-full max-w-2xl grid md:grid-cols-2 gap-5">
        {/* ── New meeting ── */}
        <div className="card p-7 flex flex-col gap-4">
          <div>
            <div className="text-2xl">＋</div>
            <h2 className="text-lg font-semibold mt-1">Create meeting</h2>
            <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
              Generates a fresh meeting code instantly — start the room, then share the
              code with any Empire member. You will land on the camera lobby next.
            </p>
          </div>
          <button
            className="btn-primary mt-auto"
            disabled={!lkConfigured}
            onClick={() => setEntered(newMeetingCode())}
          >
            Start new meeting
          </button>
        </div>

        {/* ── Join with code ── */}
        <div className="card p-7 flex flex-col gap-4">
          <div>
            <div className="text-2xl">⌨︎</div>
            <h2 className="text-lg font-semibold mt-1">Join with code</h2>
            <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
              Enter the code shared with you by the meeting host.
            </p>
          </div>
          <form onSubmit={onEnter} className="mt-auto space-y-3">
            <input
              className="input text-center tracking-wide font-mono"
              name="room"
              placeholder="meeting code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!lkConfigured}
              autoComplete="off"
              required
            />
            {error && <p className="text-xs text-[var(--color-loss)]">{error}</p>}
            <button className="btn-primary w-full" disabled={!lkConfigured} type="submit">
              Join meeting
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 w-full max-w-2xl space-y-3">
        {!lkConfigured && (
          <div className="badge badge-setup w-full justify-center py-2">
            Setup required — LiveKit keys are missing from the server environment.
          </div>
        )}
        <p className="text-[11px] text-center text-[var(--color-muted)]">
          Secure in-app meetings • Joining as <span className="text-white">{defaultName}</span> •
          signed-in Empire members only
        </p>
      </div>
    </main>
  );
}
