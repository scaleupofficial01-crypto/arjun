# ERROR-LOG — Empire

Running log of defects found/fixed. Read this before touching related code
(master prompt §6). New entries go on top.

## 2026-10-13 — Phase 1 scaffold (fresh codebase)
- Project initialized fresh in this workspace (prior ARJUN/TradeVault repo was
  not reachable from this environment; user authorized a fresh scaffold).
- Known-bug preventions from master prompt §4 baked in from day one:
  1. Meeting host guard: meeting API must return `host`; UI uses `?.` + fallback. *(applies Phase 5)*
  2. Video tiles: attach tracks from React state after publish; sweep publications on join. *(Phase 5)*
  3. Screen share as separate `Source.ScreenShare` track, `object-contain`. *(Phase 5)*
  4. TradingView: must use `embed-widget-advanced-chart.js` with
     `tradingview-widget-container` class. *(Phase 2)*
  5. **DONE** — session revocation deletes Redis cache entry, not just DB row
     (`src/lib/session.ts` — cache key deleted before DB update; `logout-all`
     clears every live cache key).
  6. **DONE** — realtime env pair check: `integrationStatus()` flags
     NEXT_PUBLIC_REALTIME_PROVIDER / REALTIME_PROVIDER mismatch; dashboard
     shows a visible warning.
  7. Pool starvation: Supabase pooler URL must carry `connection_limit=10` and
     generous `pool_timeout` — documented in `/credentials/README.md`; Prisma
     datasource points at pooled `DATABASE_URL`, migrations use `DIRECT_URL`.
  8. Post visibility: PRIVATE|GROUP|PUBLIC must be enforced server-side on
     every feed/post route. *(applies Phase 6)*

## 2026-10-13 — Phase 2 build (journal/calendar/analytics/charts/watchlists+alerts)
- Built per §3. TradingView uses embed-widget-advanced-chart.js inside
  tradingview-widget-container (bug #4 rule followed).
- Bug #4 adjacency: chart persistence via capture/restore of the widget's
  localStorage store, mirrored server-side per user+symbol. If TradingView
  changes storage internals, explicit "Save drawings now" still captures raw
  store — monitor after TradingView widget updates.
- SEC-FIX pattern reused everywhere: ownership (`userId` / join through
  parent) enforced in WHERE clauses on all Phase-2 routes; verified by
  cross-user test (intruder sees 0 trades, 404 on delete/attach attempts).
- File export (.csv/.xlsx) streams only rows owned by the caller.
- Alerts fire only from real fetched prices (Coinbase/Frankfurter); unsupported
  symbols skipped; concurrent-fire guarded by updateMany(active:true).
- vercel.json cron is daily — Vercel Hobby free tier only allows daily cron
  runs; documented every-minute alternative in README (external free pinger +
  Authorization bearer). Do not silently "fix" by upgrading plan (§0 approval).
- Prisma 7 is installed by default on fresh installs — pinned to 6.19.0
  deliberately (stable prisma-client-js + datasourceUrl override); /tmp npx
  pulls v7 and fails on our schema, always use ./node_modules/.bin/prisma.
- Sandbox quirks (not app bugs): node_modules + .next purged between sessions;
  scripts/preview.sh self-heals; git needs identity re-set per session;
  credentials/.env sourcing needs quoted values for '&' in URLs.
