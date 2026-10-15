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
  onLeave: () => void;
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
              ? "The meeting service is not configured on the server yet"
              : data.error ?? "Could not get an access token",
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
          <button
            className="text-xs px-2.5 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)]"
            onClick={() => void (navigator.clipboard?.writeText(room) ?? Promise.resolve()).catch(() => {})}
            title="Copy meeting code"
          >
            ⧉ copy code
          </button>
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
            Meeting: <span className="font-mono text-white">{room}</span> — check your camera
            and mic, then join. The browser will ask for camera and microphone access.
          </p>
        </div>
        {error && <p className="text-sm text-center text-[var(--color-loss)]">{error}</p>}
        <div className="card p-4 [&_.lk-join-prejoin]:bg-transparent">
          {lkConfigured ? (
            <PreJoin
              joinLabel="Join now"
              onSubmit={(choices) => void go(choices.username || defaultName)}
            />
          ) : (
            <p className="text-sm text-[var(--color-muted)] text-center py-6">
              The lobby will appear here once LiveKit is configured.
            </p>
          )}
        </div>
        <p className="text-[11px] text-center text-[var(--color-muted)]">
          Share the room name — any Empire member can join inside. The access token
          expires in 2 hours.
        </p>
      </div>
    </main>
  );
}
