import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { integrationStatus } from "@/lib/env";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { LogoutButton, LogoutEverywhereButton } from "@/components/logout-buttons";
import Tilt from "@/components/tilt";
import EmpireScene from "@/components/empire-scene";

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
  { name: "Trading Journal", href: "/journal", phase: null, ready: true, desc: "Trades, groups, screenshots, CSV/Excel import-export. P&L always server-computed." },
  { name: "Live Charts", href: "/charts", phase: null, ready: true, desc: "TradingView advanced chart. Your drawings persist per symbol across devices." },
  { name: "Calendar", href: "/calendar", phase: null, ready: true, desc: "Daily & monthly P&L heatmap — click any day to see its trades." },
  { name: "Analytics", href: "/analytics", phase: null, ready: true, desc: "Win rate, expectancy, profit factor, max drawdown vs true peak, equity curve." },
  { name: "Watchlists & Alerts", href: "/watchlists", phase: null, ready: true, desc: "Real prices only (Coinbase live / ECB forex). Alerts fire on real crosses." },
  { name: "MT5 Sync", href: "/mt5", phase: null, ready: true, desc: "Read-only EA bridge — terminal pushes deals/positions with a scoped token. No passwords stored, ever." },
  { name: "Messenger", href: null, phase: "In development", ready: false, desc: "Pro DM chat: groups, reactions, read receipts, chart sharing." },
  { name: "Empire Meet", href: "/meet", phase: null, ready: true, desc: "In-app video meetings with screen share — logged-in access only. No external links." },
  { name: "Community", href: null, phase: "In development", ready: false, desc: "Trader profiles, follows, analysis posts with server-side visibility rules." },
  { name: "Admin", href: null, phase: "In development", ready: false, desc: "Moderation, feature flags, integration health — server-side role gates." },
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
          <span className="badge badge-demo mr-2">Shared workspace</span>
          No login needed — you are working in a shared demo workspace. Every
          feature below is fully functional; data here is demo data anyone with
          the link can see.
        </div>
      )}

      {/* ── 3D hero: the 10-level golden staircase rises behind the title ── */}
      <section className="card relative overflow-hidden p-0 h-52 md:h-60">
        <EmpireScene className="absolute inset-0 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0f1acc] via-[#0a0f1a55] to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex flex-col justify-center px-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Empire</span> Dashboard
          </h1>
          <p className="text-sm md:text-base text-[var(--color-muted)] mt-1.5">
            10 levels. One Empire. — welcome, <span className="text-white font-medium">{user.displayName}</span>
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            {user.email} · role: {user.role.toLowerCase()}
            {!user.emailVerifiedAt && !isDemo && (
              <span className="badge badge-setup ml-2">email not verified</span>
            )}
          </p>
        </div>
        {!isDemo && (
          <div className="absolute top-4 right-4 flex gap-2">
            <LogoutEverywhereButton />
            <LogoutButton />
          </div>
        )}
      </section>

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
        {!integ.livekit && (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            LiveKit keys add karo to Meet green ho jayega.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Missing pieces stay visibly marked until the required key is added to /credentials/.env — nothing here is faked as working.
        </p>
      </section>

      <section className="grid md:grid-cols-3 sm:grid-cols-2 gap-4">
        {modules.map((m) =>
          m.ready && m.href ? (
            <Tilt key={m.name}>
              <Link href={m.href} className="card block p-5 h-full hover:border-[var(--color-accent)] transition group">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold group-hover:text-[var(--color-accent)] transition">{m.name}</h3>
                  <span className="text-[var(--color-muted)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition">→</span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">{m.desc}</p>
                <span className="badge badge-live mt-3">Live — open</span>
              </Link>
            </Tilt>
          ) : (
            <div key={m.name} className="card p-5 opacity-70">
              <h3 className="font-semibold">{m.name}</h3>
              <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">{m.desc}</p>
              <span className="badge badge-setup mt-3">{m.phase}</span>
            </div>
          ),
        )}
      </section>
    </main>
  );
}
