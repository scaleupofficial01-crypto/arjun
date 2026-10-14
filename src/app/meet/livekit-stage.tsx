"use client";

import { useCallback, useState } from "react";
import { LiveKitRoom, PreJoin, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

/**
 * Google-Meet-style flow: lobby with live camera preview + device pickers
 * (PreJoin) → Join → tile-grid/video conference with mic/cam/screen-share —
 * everything behind login, tokens minted server-side.
 */
export default function LiveKitStage({
  room,
  lkConfigured,
  defaultName,
  onLeave,
}: {
  room: string;
  lkConfigured: boolean;
  defaultName: string;
}) {
  const [sess, setSess] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(
    async (username: string) => {
      setError(null);
      try {
        const r = await fetch(
          `/api/meet/token?room=${encodeURIComponent(room)}&name=${encodeURIComponent(username)}`,
        );
        const data = (await r.json().catch(() => ({}))) as { error?: string; token?: string; url?: string };
        if (!r.ok || !data.token || !data.url) {
          setError(
            r.status === 503
              ? "Meet abhi configure nahi hua (server env me LiveKit keys baaki)"
              : data.error ?? "Token nahi mila",
          );
          return;
        }
        setSess({ token: data.token, url: data.url });
      } catch {
        setError("Network issue — try again");
      }
    },
    [room],
  );

  if (sess) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.25rem)]">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">
            <span className="text-[var(--color-accent)]">Empire</span> Meet ·{" "}
            <span className="font-mono">{room}</span>
          </span>
          <span className="text-[11px] text-[var(--color-muted)]">secure in-app room</span>
          <button
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
        <div data-lk-theme="default" className="flex-1 min-h-0 bg-black">
          <LiveKitRoom
            serverUrl={sess.url}
            token={sess.token}
            connect
            onDisconnected={onLeave}
            style={{ height: "100%" }}
          >
            <VideoConference />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">
            <span className="text-[var(--color-accent)]">Empire</span> Meet
          </h1>
          <p className="text-xs text-[var(--color-muted)]">
            Meeting: <span className="font-mono text-white">{room}</span> — camera/mic check
            karo, phir Join. Browser mic+camera permission mangega — allow karo.
          </p>
        </div>
        {error && <p className="text-sm text-center text-[var(--color-loss)]">{error}</p>}
        <div className="card p-4 [&_.lk-join-prejoin]:bg-transparent">
          {lkConfigured ? (
            <PreJoin
              joinLabel="Join now"
              persistUserDefaults={false}
              onSubmit={(choices) => void go(choices.username || defaultName)}
            />
          ) : (
            <p className="text-sm text-[var(--color-muted)] text-center py-6">
              Lobby yahan aayegi jab LiveKit keys set ho jayengi.
            </p>
          )}
        </div>
        <p className="text-[11px] text-center text-[var(--color-muted)]">
          Room ka naam share karo — jo Empire pe login rakhta hai, wahi andar aa sakta hai.
          2-hour security token.
        </p>
      </div>
    </main>
  );
}
