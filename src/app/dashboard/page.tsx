import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { integrationStatus } from "@/lib/env";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { LogoutButton, LogoutEverywhereButton } from "@/components/logout-buttons";

export const metadata = { title: "Dashboard — Empire" };
export const dynamic = "force-dynamic";

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? "badge-live" : "badge-setup"}`}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "#4ade80" : "#fbbf24" }}
      />
      {label}: {ok ? "connected" : "setup required"}
    </span>
  );
}

const modules = [
  { name: "Trading Journal", href: "/journal", phase: null, ready: true },
  { name: "Live Charts", href: "/charts", phase: null, ready: true },
  { name: "Calendar", href: "/calendar", phase: null, ready: true },
  { name: "Analytics", href: "/analytics", phase: null, ready: true },
  { name: "Watchlists & Alerts", href: "/watchlists", phase: null, ready: true },
  { name: "MT5 Sync", href: null, phase: "Phase 3", ready: false },
  { name: "Messenger", href: null, phase: "Phase 4", ready: false },
  { name: "Empire Meet", href: null, phase: "Phase 5", ready: false },
  { name: "Community", href: null, phase: "Phase 6", ready: false },
  { name: "Admin", href: null, phase: "Phase 6", ready: false },
];

export default async function DashboardPage() {
  const sessionUser = await getCurrentUser();
  // Demo mode (local preview only): no session → render with demo identity.
  const isDemo = !sessionUser && DEMO_MODE;
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const integ = integrationStatus();

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 py-8 space-y-8">
      {isDemo && (
        <div className="card p-4 border-amber-500/40 bg-amber-500/5 text-sm">
          <span className="badge badge-demo mr-2">Demo preview</span>
          Login is bypassed in this preview build (DEMO_MODE). Production keeps
          full auth. <Link className="underline text-[var(--color-accent)]" href="/">Back to landing</Link>
        </div>
      )}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Empire</span> Dashboard
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            {user.displayName} · {user.email} · role: {user.role.toLowerCase()}
            {!user.emailVerifiedAt && !isDemo && (
              <span className="badge badge-setup ml-2">email not verified</span>
            )}
          </p>
        </div>
        {!isDemo && (
          <div className="flex gap-2">
            <LogoutEverywhereButton />
            <LogoutButton />
          </div>
        )}
      </header>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Integrations</h2>
        <div className="flex flex-wrap gap-2">
          <Pill ok={integ.database} label="Database" />
          <Pill ok={integ.redis} label="Redis cache" />
          <Pill ok={integ.email} label="Email" />
          <Pill ok={integ.googleOAuth} label="Google Sign-In" />
          <Pill ok={Boolean(integ.realtime.provider) && !integ.realtime.misconfigured} label="Realtime" />
          <Pill ok={integ.livekit} label="LiveKit / Meet" />
          <Pill ok={integ.mt5} label="MT5 bridge" />
        </div>
        {integ.realtime.misconfigured && (
          <p className="mt-3 text-sm text-amber-400">
            Realtime misconfigured: NEXT_PUBLIC_REALTIME_PROVIDER and
            REALTIME_PROVIDER must be set together (known bug #6).
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Missing pieces stay visibly marked until the required key is added to
          /credentials/.env — nothing here is faked as working.
        </p>
      </section>

      <section className="grid md:grid-cols-3 sm:grid-cols-2 gap-4">
        {modules.map((m) =>
          m.ready && m.href ? (
            <Link key={m.name} href={m.href} className="card p-5 hover:border-[var(--color-accent)] transition">
              <h3 className="font-semibold">{m.name}</h3>
              <span className="badge badge-live mt-3">Live — open</span>
            </Link>
          ) : (
            <div key={m.name} className="card p-5 opacity-90">
              <h3 className="font-semibold">{m.name}</h3>
              <span className="badge badge-setup mt-3">{m.phase} — coming soon</span>
            </div>
          ),
        )}
      </section>
    </main>
  );
}
