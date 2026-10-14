# Empire — The Real Trader's Hub

Journal, chart, analyze and share your trading. Real math from real records
only — no fabricated numbers, no fake statuses.

> Renamed from ARJUN / TradeVault. Same product vision: one hub for journals,
> live charts with persistent drawings, analytics, alerts, MT5 sync, messenger,
> Empire Meet video meetings and community.

## 🌐 Production (live)

- **URL:** https://empire-trading-app.vercel.app — Vercel, **auto-deploys on every push to `main`**
  (commit author must be a Vercel seat member, else the build is seat-blocked).
- **Database:** Supabase Postgres `oqmlctqtqtwdvyyvvjcrha` via the **ap-southeast-1 pooler** —
  ONE shared real DB for production and the sandbox preview (no drift possible).
- **Auth:** `AUTH_REQUIRED=true` in production — real accounts only, demo mode off.
- **Cron:** `/api/cron/alerts` daily 08:00 UTC (CRON_SECRET-guarded, declared in `vercel.json`).

### Go-live checklist — real MT5 terminal

1. Register at the URL above (your real email → your workspace).
2. **MT5 Sync → Add account** → paste your MT5 credentials → copy the `mt5_…` ingest token (shown once).
3. **Download `empire_bridge.mq5`** → `MQL5/Experts` → MetaEditor → **F7** compile.
4. MT5: Tools → Options → Expert Advisors → **Allow WebRequest** for `https://empire-trading-app.vercel.app`.
5. Drag the EA onto any chart → IngestToken = the `mt5_…` token (IngestUrl already defaults to the
   production URL) → **Algo Trading ON** → first sync <1 minute → account goes live and v2 SELL/BUY unlocks
   (trades execute only inside YOUR terminal — server stores no MT5 passwords, ever).

Full runbook: `docs/DEPLOY-VERCEL.md`.

## Stack
- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **Postgres** via Supabase (Prisma ORM; pooled URL with `connection_limit=10`
  and generous `pool_timeout`)
- **Redis** (Upstash) as a session cache — the app degrades gracefully without it
- **LiveKit** (Empire Meet), **TradingView** free Advanced Chart widget,
  **Resend** (transactional email)

## Secrets (read this first)
All real secrets live ONLY in [`/credentials/.env`](credentials/README.md) —
never committed, never in Vercel logs, never in client bundles. See
`credentials/README.md` for what each key does and where it's used. Commit
only `credentials/.env.template`. Enter Vercel env vars directly in the
Vercel dashboard.

## Local dev
```bash
npm install
npx prisma generate
# npx prisma db push   # once DATABASE_URL/DIRECT_URL are set
npm run dev
```

Quality gates (run after every phase — report real counts):
```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run build
```

## Security model (short)
- bcrypt password hashing; only SHA-256 hashes of session/reset/verify tokens
  are stored
- Sessions in Postgres + Redis cache; **revoking a session deletes the Redis
  entry** (cache-first) so revoked sessions stop authenticating immediately
- CSRF/origin checks + rate limiting on every mutating route; ownership checks
  on every route touching user data
- Supabase service-role key is server-only, always
- Money in proper decimal precision; timestamps UTC, rendered in the user's
  local time zone
- Every nav item/button either works or visibly says what setup is missing

See [`docs/ERROR-LOG.md`](docs/ERROR-LOG.md) for the running defect log and
known-bug preventions.

## Roadmap (from master prompt)
1. ✅ **Phase 1 — auth & permissions**
2. ✅ **Phase 2 — journal, calendar, analytics, charts + persistent drawings,
   watchlists & alerts**
3. Phase 3 — MT5 sync (read-only bridge)
4. Phase 4 — messenger
5. Phase 5 — Empire Meet + 3D meet dashboard
6. Phase 6 — polish & admin

### Phase 1 works today
Email/password register+login (bcrypt), sessions in Postgres with Redis cache
and graceful degradation, "sign out everywhere", email verification +
password reset tokens (Resend when configured; honest setup-required state
when not), Google Sign-In with OAuth+PKCE (visible setup-required when
unconfigured), CSRF/origin checks, rate limits on auth routes.

### Phase 2 works today
- **Trading Journal** (`/journal`): multiple journals, groups, full trade CRUD
  (entry/exit/risk/fees/setup tags/notes/screenshots), CSV + Excel import/export
  (pnl always recomputed server-side), delete journal / entry / group / group's
  entries. Ownership enforced in every query.
- **Live Charts** (`/charts`): TradingView `embed-widget-advanced-chart.js` in a
  `tradingview-widget-container` (bug #4 compliant). Drawings captured from the
  widget store and persisted server-side per user per symbol — survive refresh,
  re-login, device switch; removed only by explicit delete. Data labeled
  live/delayed.
- **Calendar** (`/calendar`): daily P&L heatmap + monthly totals, computed only
  from stored closed trades; click a day for its entries.
- **Analytics** (`/analytics`): win rate, expectancy, profit factor, max
  drawdown vs true historical peak, equity curve (SVG), per-instrument
  breakdown. Unit-tested math (`tests/analytics.test.ts`).
- **Watchlists & Alerts** (`/watchlists`): multiple watchlists, real prices
  (Coinbase live spot for crypto, Frankfurter/ECB daily for forex — labeled;
  listed equities show honest "unsupported on free tier" instead of fake
  prices). Alerts fire only from real fetched prices, idempotently, and create
  notifications (`/notifications`, 🔔 in nav).
- **Alert scheduling**: production = Vercel Cron `GET /api/cron/alerts` daily on
  free Hobby tier (`vercel.json`; free tier allows daily runs). For every-minute
  checks use a free external pinger (e.g. cron-job.org) hitting the same URL
  with `Authorization: Bearer <CRON_SECRET>`. Preview uses
  `scripts/alert-poller.sh`. "Check now" button also runs a real check on demand.

### Phase 3 works today
- **MT5 Sync** (`/mt5`): read-only bridge with an honest security model —
  **no MT5 password (master OR investor) ever touches this server**. Register
  an account (login number + server only) → get a scoped per-account ingest
  token (shown once, sha256-stored, rotatable) → the terminal-side EA
  [`public/empire_bridge.mq5`](public/empire_bridge.mq5) pushes balance/equity,
  open positions and closed deals to `POST /api/mt5/ingest` every N seconds.
  Deals upsert by ticket (idempotent), positions are an authoritative
  snapshot, and **Import to journal** converts IN/OUT deal pairs into real
  closed trades with pnl recomputed server-side (terminal-reported profit is
  never trusted). Until an EA connects, accounts honestly show
  "waiting for first sync".
  Protocol E2E-verified: `22.5×0.1 − 1.75 = 0.5` exactly.

### No-auth mode (default — owner directive)
The app does **not** require or display a login step: `/`, `/login`,
`/register`, `/forgot-password`, `/reset-password`, `/verify-email` all
redirect straight to `/dashboard`, and every visitor works under one shared
identity (`demo-preview-user`, badge-labeled "Demo" in the nav).
Set `AUTH_REQUIRED=true` (see `credentials/.env.template`) to switch sessions,
sign-in, sign-up and email verification back on — the full auth stack still
exists and is exercised by the test suite (`NODE_ENV=test` always enforces
auth regardless of this flag).

