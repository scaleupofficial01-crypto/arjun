import Link from "next/link";
import { redirect } from "next/navigation";
import { DEMO_MODE } from "@/lib/demo";

const features = [
  ["Trading Journal", "Full trade CRUD, risk, P&L, screenshots, CSV/Excel import-export. All math from your real records."],
  ["Live Charts", "TradingView advanced charts with persistent per-symbol drawings that survive refresh and re-login."],
  ["Calendar", "Daily/monthly P&L heatmap linked straight to journal entries."],
  ["Analytics", "Win rate, expectancy, profit factor, max drawdown vs true historical peak, equity curve."],
  ["Watchlists & Alerts", "Multiple watchlists and price alerts that fire from real price data only."],
  ["MT5 Sync", "Two-way sync with your MT5 account via read-only bridge — no master password ever."],
  ["Messenger", "Pro DM-style chat: groups, reactions, read receipts, chart sharing."],
  ["Empire Meet", "Fully in-app video meetings with screen share. No external links."],
  ["Community", "Trader profiles, follows, analysis posts, groups, server-side visibility rules."],
] as const;

export default function Home() {
  // No-auth mode (default): skip the marketing/login gate entirely and take
  // visitors straight into the app. AUTH_REQUIRED=true restores this page.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <span className="text-xl font-bold">
          <span className="text-[var(--color-accent)]">Empire</span>
          <span className="text-[var(--color-muted)] font-normal text-sm ml-2">
            The Real Trader&apos;s Hub
          </span>
        </span>
        <div className="flex gap-3">
          <Link href="/login" className="px-4 py-2 text-sm text-[var(--color-muted)] hover:text-white">
            Log in
          </Link>
          <Link href="/register" className="btn-primary text-sm">
            Create account
          </Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl font-bold leading-tight">
          Trade. Journal. <span className="text-[var(--color-accent)]">Dominate.</span>
        </h1>
        <p className="mt-6 text-lg text-[var(--color-muted)] max-w-2xl mx-auto">
          One hub for your trading life — journal every trade, analyze the real
          math behind your performance, sync MT5, and meet with your trading
          circle without leaving the app.
        </p>
        <div className="mt-10 flex justify-center gap-4 flex-wrap">
          {process.env.DEMO_MODE === "true" ? (
            <Link href="/dashboard" className="btn-primary">
              Open dashboard — demo preview (no login)
            </Link>
          ) : (
            <Link href="/register" className="btn-primary">Start your empire</Link>
          )}
          <Link href="/login" className="px-4 py-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">
            Log in
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid md:grid-cols-3 gap-4">
        {features.map(([title, desc]) => (
          <div key={title} className="card p-5">
            <h3 className="font-semibold text-[var(--color-accent)]">{title}</h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{desc}</p>
          </div>
        ))}
      </section>

      {/* master prompt §5: any demo data on the landing page must be labeled */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Equity curve</h3>
            <span className="badge badge-demo">Preview — demo data</span>
          </div>
          <svg viewBox="0 0 600 160" className="w-full h-40" aria-hidden>
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,140 L60,120 L120,128 L180,96 L240,104 L300,72 L360,84 L420,52 L480,64 L540,36 L600,44 L600,160 L0,160 Z"
              fill="url(#eq)"
            />
            <path
              d="M0,140 L60,120 L120,128 L180,96 L240,104 L300,72 L360,84 L420,52 L480,64 L540,36 L600,44"
              fill="none" stroke="#f59e0b" strokeWidth="2"
            />
          </svg>
          <p className="text-xs text-[var(--color-muted)] mt-3">
            Illustrative preview only — not a real account, not a performance
            claim. Your dashboard computes everything from your own journal.
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border)] px-6 py-6 text-center text-sm text-[var(--color-muted)]">
        Empire — The Real Trader&apos;s Hub. Real math, real data, no fabricated numbers.
      </footer>
    </main>
  );
}
