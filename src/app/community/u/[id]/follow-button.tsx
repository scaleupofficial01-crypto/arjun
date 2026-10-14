"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FollowButton({ userId, initial }: { userId: string; initial: boolean }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/community/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = (await r.json()) as { following?: boolean };
      if (typeof d.following === "boolean") setFollowing(d.following);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-primary text-xs" disabled={busy} onClick={() => void toggle()}>
      {following ? "Following ✓" : "Follow"}
    </button>
  );
}
