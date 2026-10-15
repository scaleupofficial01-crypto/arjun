"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Post = {
  id: string;
  text: string;
  kind: string;
  visibility: string;
  at: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  mine: boolean;
  iFollow: boolean;
};

export default function FeedApp({ posts, me }: { posts: Post[]; me: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"note" | "analysis">("note");
  const [visibility, setVisibility] = useState<"PUBLIC" | "FOLLOWERS">("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), kind, visibility }),
      });
      if (r.ok) {
        setText("");
        router.refresh();
      } else {
        setErr("Could not publish the post");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow(userId: string) {
    await fetch("/api/community/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <form onSubmit={(e) => void publish(e)} className="card p-5 space-y-3">
        <textarea
          className="input min-h-[84px] resize-y"
          placeholder={`Share a trade note or analysis, ${me}…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
        />
        <div className="flex items-center gap-2 text-xs">
          <select className="input w-auto text-xs py-1.5" value={kind} onChange={(e) => setKind(e.target.value as "note" | "analysis")}>
            <option value="note">📝 note</option>
            <option value="analysis">📊 analysis</option>
          </select>
          <select
            className="input w-auto text-xs py-1.5"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "FOLLOWERS")}
          >
            <option value="PUBLIC">🌐 public</option>
            <option value="FOLLOWERS">👥 followers only</option>
          </select>
          <button className="btn-primary ml-auto text-xs" disabled={busy || !text.trim()} type="submit">
            Post
          </button>
        </div>
        {err && <p className="text-xs text-[var(--color-loss)]">{err}</p>}
        <p className="text-[10px] text-[var(--color-muted)]">
          Followers-only posts are visible to your followers.
        </p>
      </form>

      <div className="space-y-3">
        {posts.length === 0 && (
          <div className="card p-5 text-sm text-[var(--color-muted)]">
            No posts yet.
          </div>
        )}
        {posts.map((p) => (
          <article key={p.id} className="card p-5">
            <div className="flex items-center gap-2 text-sm">
              <Link href={`/community/u/${p.authorId}`} className="font-semibold hover:text-[var(--color-accent)]">
                {p.authorName}
              </Link>
              {p.authorRole === "ADMIN" && <span className="badge badge-live">admin</span>}
              <span className="badge badge-setup">{p.kind === "analysis" ? "📊 analysis" : "📝 note"}</span>
              <span className="text-[10px] text-[var(--color-muted)]">{p.visibility === "PUBLIC" ? "🌐 public" : "👥 followers"}</span>
              <span className="ml-auto text-[10px] text-[var(--color-muted)]">
                {new Date(p.at).toLocaleString("en-IN", { hour12: false })}
              </span>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{p.text}</p>
            {!p.mine && (
              <button
                className="mt-3 text-xs px-2.5 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)]"
                onClick={() => void toggleFollow(p.authorId)}
              >
                {p.iFollow ? "Unfollow" : "Follow"}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
