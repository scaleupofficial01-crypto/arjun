import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import FeedApp from "./feed-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Community — Empire" };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");

  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen">
        <AppNav active="community" />
        <div className="max-w-3xl mx-auto p-8">
          <div className="card p-6">
            <span className="badge badge-setup">Database setup required</span>
          </div>
        </div>
      </main>
    );
  }

  // Server-side visibility rules: PUBLIC for everyone + FOLLOWERS posts only
  // for authors on my following list (+ my own posts).
  const follows = await db.follow.findMany({ where: { followerId: user.id }, select: { followingId: true } });
  const followingIds = follows.map((f) => f.followingId);
  const posts = await db.post.findMany({
    where: {
      OR: [
        { visibility: "PUBLIC" },
        { visibility: "FOLLOWERS", authorId: { in: [...followingIds, user.id] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { author: { select: { id: true, displayName: true, role: true, imageUrl: true } } },
  });

  const followingSet = new Set(followingIds);

  return (
    <main className="min-h-screen">
      <AppNav active="community" />
      <FeedApp
        me={user.displayName}
        posts={posts.map((p) => ({
          id: p.id,
          text: p.text,
          kind: p.kind,
          visibility: p.visibility,
          at: p.createdAt.toISOString(),
          authorId: p.author.id,
          authorName: p.author.displayName,
          authorRole: p.author.role,
          mine: p.author.id === user.id,
          iFollow: p.author.id === user.id ? false : followingSet.has(p.author.id),
        }))}
      />
    </main>
  );
}
