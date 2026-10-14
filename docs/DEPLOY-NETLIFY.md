# Deploy Empire to Netlify — runbook

## 0. What Netlify gets us (and what it doesn't)

- `netlify.toml` + `@netlify/plugin-nextjs` runs this Next.js 15 app (SSR +
  all `/api/*` routes) as Netlify Functions. No code changes needed.
- Netlify is **hosting only**. The app still needs a real Postgres — use
  [Neon](https://neon.tech) free tier (serverless Postgres, works with Prisma
  `DATABASE_URL` + `DIRECT_URL` pair already in `.env`).
- The MT5 EA (`public/empire_bridge.mq5`) pushes to whatever origin is typed
  into its `IngestUrl` input — after going live, users must use the Netlify
  origin there. Existing Vercel-origin EAs keep working only if Vercel stays
  up; rotate origins when you flip DNS.

## 1. One-time setup

1. Neon: create project → copy **pooled** connection string as `DATABASE_URL`
   and the **direct** one as `DIRECT_URL`. Run `npx prisma db push` locally
   against it once (or let CI run it).
2. Netlify dashboard → Team settings → **Personal access tokens → New token**
   (`nfp_...`). Keep it local only: put `NETLIFY_AUTH_TOKEN=...` (and
   optionally `NETLIFY_SITE_ID=...`) in `credentials/.env` — that file is
   gitignored and never leaves this sandbox.
3. Site env vars (Netlify UI → Site configuration → Environment variables,
   or `netlify env:set`):

   | Var | Needed? | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | yes | Neon pooled string |
   | `DIRECT_URL` | yes | Neon direct string (migrations) |
   | `AUTH_SECRET` | yes | `openssl rand -base64 32` |
   | `CRON_SECRET` | yes | any long random; used for alert cron |
   | `NEXT_PUBLIC_APP_URL` | yes | final site origin (shown to users/EA setup) |
   | `AUTH_REQUIRED` | decide | `true` = real login screens; unset = shared demo workspace (owner's current default) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | only if email | verification/alert emails |
   | `REDIS_URL`, `REDIS_TOKEN` | only if Upstash | rate-limit persistence; app degrades gracefully without it |
   | `GOOGLE_CLIENT_ID/SECRET` | only if Google OAuth | must match callback URL |
   | LiveKit/Supabase vars | only if realtime | optional integrations |

## 2. Deploy (from this sandbox, after you paste the token)

```bash
cd /home/user/empire
set -a; . ./credentials/.env; set +a          # provides NETLIFY_AUTH_TOKEN
npm i -D netlify-cli                           # local only, no repo change
# first time: link (creates site or picks existing)
npx netlify link --name empire-hub             # or: netlify sites:create
# build + ship to production
npx netlify deploy --build --prod
```

## 3. After go-live

- Alerts: Vercel Cron is gone — Netlify Scheduled Functions aren't configured
  here, so point any external scheduler (cron job / uptime service) at
  `POST https://<site>/api/cron/alerts` with header
  `Authorization: Bearer $CRON_SECRET` every minute.
- Health check: `GET /api/health` should return 200 before you hand the link out.
- First EA connection from the new origin: add the Netlify origin to MT5 →
  Tools → Options → Expert Advisors → WebRequest allowlist.

## 4. Rollback

`npx netlify rollback` restores the last published deploy. DB schema changes
(Prisma `db push`) are NOT atomic with deploys — prefer additive migrations.
