# Empire — The Real Trader's Hub

Journal, chart, analyze and share your trading. Real math from real records
only — no fabricated numbers, no fake statuses.

> Renamed from ARJUN / TradeVault. Same product vision: one hub for journals,
> live charts with persistent drawings, analytics, alerts, MT5 sync, messenger,
> Empire Meet video meetings and community.

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
1. ✅ **Phase 1 — auth & permissions** (this state; details below)
2. Phase 2 — journal, calendar, analytics, charts with persistent drawings
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
