import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import AppNav from "@/components/app-nav";
import FollowButton from "./follow-button";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Trader Profile — Empire" };
export const dynamic = "force-dynamic";

export default async function TraderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const { id } = await params;

  const db = getDb();
  if (!db) redirect("/community");

  const trader = await db.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, role: true, imageUrl: true, createdAt: true },
  });
  if (!trader) notFound();

  const [followers, following, iFollow] = await Promise.all([
    db.follow.count({ where: { followingId: trader.id } }),
    db.follow.count({ where: { followerId: trader.id } }),
    db.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId: trader.id } } }),
  ]);

  // Server-side visibility: followers-only posts visible to me iff I follow them (or it's me).
  const canSeeFollowersOnly = trader.id === user.id || Boolean(iFollow);
  const posts = await db.post.findMany({
    where: {
      authorId: trader.id,
      ...(canSeeFollowersOnly ? {} : { visibility: "PUBLIC" }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const mine = trader.id === user.id;

  return (
    <main className="min-h-screen">
      <AppNav active="community" />
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="card p-6 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-[var(--color-panel-2)] border border-[var(--color-border)] grid place-items-center text-lg font-bold">
            {trader.displayName[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg">
              {trader.displayName}{" "}
              {trader.role === "ADMIN" && <span className="badge badge-live ml-1">admin</span>}
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              {followers} follower{followers === 1 ? "" : "s"} · {following} following · joined{" "}
              {trader.createdAt.toLocaleDateString("en-IN")}
            </p>
          </div>
          {!mine && <FollowButton userId={trader.id} initial={Boolean(iFollow)} />}
          <Link href="/community" className="text-xs text-[var(--color-muted)] hover:text-white">
            ← feed
          </Link>
        </div>

        <div className="space-y-3">
          {posts.length === 0 && (
            <div className="card p-5 text-sm text-[var(--color-muted)]">
              {canSeeFollowersOnly ? "Is trader ne abhi post nahi kiya." : "Follow karo to jyada posts dikhenge — abhi sirf public posts yahan hain."}
            </div>
          )}
          {posts.map((p) => (
            <article key={p.id} className="card p-5">
              <div className="flex items-center gap-2 text-xs">
                <span className="badge badge-setup">{p.kind === "analysis" ? "📊 analysis" : "📝 note"}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{p.visibility === "PUBLIC" ? "🌐 public" : "👥 followers"}</span>
                <span className="ml-auto text-[10px] text-[var(--color-muted)]">
                  {p.createdAt.toLocaleString("en-IN", { hour12: false })}
                </span>
              </div>
              <p className="text-sm mt-2 whitespace-pre-wrap break-words">{p.text}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
