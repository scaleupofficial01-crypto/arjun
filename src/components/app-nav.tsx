import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

const links = [
  ["/dashboard", "Dashboard"],
  ["/journal", "Journal"],
  ["/charts", "Charts"],
  ["/calendar", "Calendar"],
  ["/analytics", "Analytics"],
  ["/watchlists", "Watchlists"],
  ["/mt5", "MT5"],
] as const;

export default async function AppNav({ active }: { active: string }) {
  const sessionUser = await getCurrentUser();
  const isDemo = !sessionUser && DEMO_MODE;

  let unread = 0;
  const db = getDb();
  const userId = sessionUser?.id ?? (isDemo ? DEMO_USER.id : null);
  if (db && userId) {
    try {
      unread = await db.notification.count({ where: { userId, readAt: null } });
    } catch {
      unread = 0;
    }
  }

  return (
    <nav className="border-b border-[var(--color-border)] px-6 py-3 flex items-center gap-6 sticky top-0 bg-[var(--color-background)] z-10">
      <Link href="/dashboard" className="text-lg font-bold shrink-0">
        <span className="text-[var(--color-accent)]">Empire</span>
      </Link>
      <div className="flex gap-4 text-sm overflow-x-auto">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={
              active === label.toLowerCase()
                ? "text-[var(--color-accent)] font-semibold whitespace-nowrap"
                : "text-[var(--color-muted)] hover:text-white whitespace-nowrap"
            }
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <Link href="/notifications" className="text-sm text-[var(--color-muted)] hover:text-white">
          🔔{unread > 0 && <span className="ml-1 text-[var(--color-accent)] font-semibold">{unread}</span>}
        </Link>
        {isDemo && <span className="badge badge-demo">Demo</span>}
      </div>
    </nav>
  );
}
