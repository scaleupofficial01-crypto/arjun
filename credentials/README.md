# `/credentials` — how secrets are handled in Empire

One file holds every real secret: **`/credentials/.env`**. It is never
committed, pushed, exported, copied into deliverables, or printed in chat.
`.env.template` (empty values) documents the full key set and **is** safe to
commit. When a new key is added: real value → `.env`, empty key name →
`.env.template` → wire into `src/lib/env.ts` (server-only) or
`src/lib/env-config.ts` (client-safe `NEXT_PUBLIC_*` only) → update this file.

## Key reference

| Key | Used for | Where used |
|---|---|---|
| `AUTH_SECRET` | Signing session tokens | `src/lib/env.ts`, auth config |
| `DATABASE_URL` | Supabase **pooler** Postgres URL — keep `connection_limit≈10`, generous `pool_timeout` (bug #7) | Prisma/DB client, server-only |
| `DIRECT_URL` | Supabase direct (non-pooled) URL, for migrations | Prisma datasource |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client + server Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS-safe) | Client Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB/storage ops — **server-only, always** | `src/lib/env.ts` only; never shipped to browser |
| `REDIS_URL` / `REDIS_TOKEN` | Session cache in front of Postgres; app degrades gracefully if Redis is down. Revocation MUST delete the cache entry (bug #5) | Session store |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email verification + password reset | Email lib, server-only |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Sign-In (OAuth + PKCE). UI shows **setup-required** until configured | Auth config; secret is server-only |
| `NEXT_PUBLIC_REALTIME_PROVIDER` / `REALTIME_PROVIDER` | Messenger/notifications realtime. **Both must be set together** (bug #6) | Realtime client + server |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` | Empire Meet video meetings (token minting server-side; URL is client-safe) | Meet token route + room client |
| `MT5_BRIDGE_URL` / `MT5_BRIDGE_API_KEY` | MT5 EA push bridge — investor/read-only credentials only, never master password | MT5 sync worker/webhook, server-only |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL (OAuth redirects, emails) | Client + server |
| `CRON_SECRET` | Protecting cron/alert routes (price alerts fire from real data only) | Route guards |

| `DEMO_MODE` | **Local preview only** — bypasses login on protected pages. Never set in production. | Server components |

| `GITHUB_TOKEN` | Pushing commits to the GitHub repo (§2) | git remote auth, local only — never committed (lives in .git/config, snapshot-excluded) |

## Notes
- TradingView: free **Advanced Chart embed widget** (`embed-widget-advanced-chart.js`,
  not legacy `tv.js`) — no API key needed (bug #4).
- Vercel env vars: the user enters them in the Vercel dashboard themselves;
  the agent supplies only the list of names/values to paste — never the file.
- If a key is missing/invalid → the dependent feature renders a
  **setup-required** state. Nothing is faked as working.
