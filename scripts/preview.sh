#!/usr/bin/env bash
# Empire — one-shot preview recovery.
# This sandbox purges node_modules + .next between sessions; this script
# restores everything and starts the production server on port 3000.
set -e
cd "$(dirname "$0")/.."

# 1) Postgres — fully self-healing (apt + cluster + role/db).
bash scripts/db-bootstrap.sh || echo "[preview] WARNING: database unavailable"

# 2) Dependencies
if [ ! -x node_modules/.bin/next ] || [ ! -x node_modules/.bin/prisma ]; then
  echo "[preview] restoring node_modules..."
  npm install --no-audit --no-fund
fi

# 3) Prisma client (+ schema → fresh databases get tables automatically)
set -a; [ -f credentials/.env ] && . ./credentials/.env; set +a
[ -f node_modules/.prisma/client/index.js ] || ./node_modules/.bin/prisma generate
./node_modules/.bin/prisma db push --skip-generate >/dev/null 2>&1 || echo "[preview] WARNING: schema push failed"

# 4) Production build (purged between sessions)
[ -f .next/BUILD_ID ] || NODE_OPTIONS=--max-old-space-size=1536 npm run build

# 5) Demo content (only when the workspace is empty) — runs in background
( sleep 8 && bash scripts/seed-demo.sh >/dev/null 2>&1 ) &

# 6) Start server
exec npm start
