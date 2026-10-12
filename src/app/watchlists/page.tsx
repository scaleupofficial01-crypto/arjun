import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import WatchlistsApp from "./watchlists-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Watchlists & Alerts — Empire" };
export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");

  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen"><AppNav active="watchlists" />
        <div className="max-w-4xl mx-auto p-8"><div className="card p-6"><span className="badge badge-setup">Database setup required</span></div></div>
      </main>
    );
  }

  const [watchlists, alerts] = await Promise.all([
    db.watchlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { addedAt: "asc" } } },
    }),
    db.priceAlert.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="min-h-screen">
      <AppNav active="watchlists" />
      <WatchlistsApp
        watchlists={watchlists.map((w) => ({
          id: w.id,
          name: w.name,
          items: w.items.map((i) => ({ id: i.id, symbol: i.symbol, note: i.note })),
        }))}
        alerts={alerts.map((a) => ({
          id: a.id,
          symbol: a.symbol,
          condition: a.condition,
          targetPrice: a.targetPrice.toString(),
          note: a.note,
          active: a.active,
          triggeredAt: a.triggeredAt?.toISOString() ?? null,
          triggeredPrice: a.triggeredPrice?.toString() ?? null,
          lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
