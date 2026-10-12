import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";
import MarkRead from "./mark-read";

export const metadata = { title: "Notifications — Empire" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");

  const db = getDb();
  const notifications = db
    ? await db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <main className="min-h-screen">
      <AppNav active="notifications" />
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Notifications</h1>
          {notifications.some((n) => !n.readAt) && <MarkRead />}
        </div>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`card p-4 ${n.readAt ? "opacity-60" : "border-[var(--color-accent)]"}`}>
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="text-sm text-[var(--color-muted)] mt-1">{n.body}</p>}
                  <p className="text-xs text-[var(--color-muted)] mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt && <span className="badge badge-live h-fit">new</span>}
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="card p-8 text-center text-[var(--color-muted)]">No notifications yet — triggered price alerts will land here.</div>
          )}
        </div>
      </div>
    </main>
  );
}
