# Deploy Empire to Vercel — real-data runbook (Supabase + auth)

Goal: production at `https://empire-hub.vercel.app` running the same real
Supabase Postgres as the sandbox preview, with real login (AUTH_REQUIRED).

## Why the site 500'd before (postmortem)

Auto-deploy from `main` picked up the MT5 v2 code, but the production
Postgres never got `prisma db push`'d — queries referenced columns/tables
(`eaVersion`, `mt5_quotes`, `mt5_commands`) that didn't exist there. The
schema now lives on ONE Supabase project shared by preview + production —
drift can't come back as long as both point at it.

## Supabase (already done from the sandbox)

- Project ref `oqmlctqtwdvyyvvjcrha`, region **ap-southeast-1**.
- Direct host is IPv6-only → always use the **pooler** hosts.
- Schema (`db push`) applied — all tables incl. `mt5_quotes`/`mt5_commands`.
- Connection strings (password holds a space + `@` — keep them URL-encoded
  exactly: space→`%20`, `@`→`%40`):

```
Runtime (transaction pooler — Prisma pgbouncer mode):
postgresql://postgres.oqmlctqtwdvyyvvjcrha:<URLENCODED_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30

Migrations / session pooler (directUrl):
postgresql://postgres.oqmlctqtwdvyyvvjcrha:<URLENCODED_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

## Vercel env vars to set (Project → Settings → Environment Variables → Production)

| Var | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | runtime pooler string (above) | Vercel funcs = 1 conn each |
| `DIRECT_URL` | session pooler string (above) | migrations path |
| `AUTH_REQUIRED` | `true` | real login/register screens |
| `AUTH_SECRET` | copy from `credentials/.env` | session signing — reuse, don't rotate |
| `CRON_SECRET` | copy from `credentials/.env` | alerts cron auth |
| `NEXT_PUBLIC_APP_URL` | `https://empire-hub.vercel.app` | shown in EA guide + links |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oqmlctqtwdvyyvvjcrha.supabase.co` | optional realtime plumbing |
| `RESEND_API_KEY`, `EMAIL_FROM` | only when email wanted | app runs fine without (login doesn't require email verification) |

Never put `GITHUB_TOKEN` or the Supabase **service_role** key into the
production app's env — not needed by the runtime.

## Deploy triggers

Vercel + GitHub: pushing `main` redeploys. For env-only changes use
**Redeploy** in the dashboard (env changes apply to the NEXT deploy).

## First-login checklist (fresh real DB)

1. `/api/health` → `{"status":"ok","integrations":{"database":true}}`
2. `/register` → create YOUR admin user (first one is real, password-based;
   no email needed).
3. MT5 Sync → Add account → paste EA inputs into `empire_bridge.mq5` v2 in
   your terminal (origin allowlist = `https://empire-hub.vercel.app`).
4. First sync lands within the EA's timer cycle; SELL/BUY unlock after the
   page shows the v2 badge.
