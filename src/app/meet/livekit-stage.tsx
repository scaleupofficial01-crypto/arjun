"use client";

import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

export default function LiveKitStage({
  token,
  url,
  room,
  onLeave,
}: {
  token: string;
  url: string;
  room: string;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)]">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold">
          <span className="text-[var(--color-accent)]">Empire</span> Meet ·{" "}
          <span className="font-mono">{room}</span>
        </span>
        <span className="text-[11px] text-[var(--color-muted)]">
          in-app room · nothing external
        </span>
        <button
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
          onClick={onLeave}
        >
          Leave
        </button>
      </div>
      <div data-lk-theme="default" className="flex-1 [&_.lk-video-conference]:h-full bg-black">
        <LiveKitRoom
          serverUrl={url}
          token={token}
          connect
          video
          audio
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
