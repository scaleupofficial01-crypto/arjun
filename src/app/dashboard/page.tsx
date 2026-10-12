import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { integrationStatus } from "@/lib/env";
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
  { name: "Trading Journal", phase: "Phase 2", ready: false },
  { name: "Live Charts", phase: "Phase 2", ready: false },
  { name: "Calendar", phase: "Phase 2", ready: false },
  { name: "Analytics", phase: "Phase 2", ready: false },
  { name: "Watchlists & Alerts", phase: "Phase 2", ready: false },
  { name: "MT5 Sync", phase: "Phase 3", ready: false },
  { name: "Messenger", phase: "Phase 4", ready: false },
  { name: "Empire Meet", phase: "Phase 5", ready: false },
  { name: "Community", phase: "Phase 6", ready: false },
  { name: "Admin", phase: "Phase 6", ready: false },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const integ = integrationStatus();

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Empire</span> Dashboard
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            {user.displayName} · {user.email} · role: {user.role.toLowerCase()}
            {!user.emailVerifiedAt && (
              <span className="badge badge-setup ml-2">email not verified</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <LogoutEverywhereButton />
          <LogoutButton />
        </div>
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
        {modules.map((m) => (
          <div key={m.name} className="card p-5 opacity-90">
            <h3 className="font-semibold">{m.name}</h3>
            <span className="badge badge-setup mt-3">{m.phase} — coming soon</span>
          </div>
        ))}
      </section>
    </main>
  );
}
