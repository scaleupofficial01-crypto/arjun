import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import AdminUsers from "./admin-users";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";
import { integrationStatus } from "@/lib/env";

export const metadata = { title: "Admin — Empire" };
export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-bold text-[var(--color-accent)]">{value}</p>
      <p className="text-xs text-[var(--color-muted)] mt-0.5">{label}</p>
    </div>
  );
}

export default async function AdminPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");

  const db = getDb();
  const isAdmin = user.role === "ADMIN";

  const [users, counts] = db
    ? await Promise.all([
        db.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            emailVerifiedAt: true,
            createdAt: true,
            _count: { select: { sessions: true, trades: true } },
          },
        }),
        Promise.all([
          db.user.count(),
          db.trade.count(),
          db.session.count(),
          db.mt5Account.count(),
          db.conversation.count(),
          db.message.count(),
          db.post.count(),
          db.follow.count(),
        ]),
      ])
    : [[], [0, 0, 0, 0, 0, 0, 0, 0]];

  const integ = db && isAdmin ? integrationStatus() : null;

  return (
    <main className="min-h-screen">
      <AppNav active="admin" />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {!isAdmin ? (
          <div className="card p-6 border-amber-500/40 bg-amber-500/5">
            <span className="badge badge-setup">403 — admin only</span>
            <p className="text-sm text-[var(--color-muted)] mt-3">
              This area requires the ADMIN role (server-enforced). Your role: <b>{user.role}</b>.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold">
              <span className="text-[var(--color-accent)]">Empire</span> Admin
            </h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Users" value={counts[0]} />
              <Stat label="Trades" value={counts[1]} />
              <Stat label="Sessions" value={counts[2]} />
              <Stat label="MT5 accounts" value={counts[3]} />
              <Stat label="Conversations" value={counts[4]} />
              <Stat label="Messages" value={counts[5]} />
              <Stat label="Community posts" value={counts[6]} />
              <Stat label="Follows" value={counts[7]} />
            </div>

            {integ && (
              <section className="card p-5">
                <h3 className="font-semibold mb-3 text-sm">Integration health</h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["Database", integ.database],
                      ["Redis cache", integ.redis],
                      ["Email", integ.email],
                      ["Google Sign-In", integ.googleOAuth],
                      ["Realtime", Boolean(integ.realtime.provider) && !integ.realtime.misconfigured],
                      ["LiveKit / Meet", integ.livekit],
                      ["MT5 bridge", integ.mt5],
                    ] as [string, boolean][]
                  ).map(([label, ok]) => (
                    <span key={label} className={`badge ${ok ? "badge-live" : "badge-setup"}`}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ok ? "#4ade80" : "#fbbf24" }} />
                      {label}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <AdminUsers
              me={user.id}
              users={users.map((u) => ({
                id: u.id,
                email: u.email,
                displayName: u.displayName,
                role: u.role,
                verified: Boolean(u.emailVerifiedAt),
                createdAt: u.createdAt.toISOString(),
                sessions: u._count.sessions,
                trades: u._count.trades,
              }))}
            />
          </>
        )}
      </div>
    </main>
  );
}
