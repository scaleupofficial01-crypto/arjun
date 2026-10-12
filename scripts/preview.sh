#!/usr/bin/env bash
# Empire — one-shot preview recovery.
# This sandbox purges node_modules + .next between sessions; this script
# restores everything and starts the production server on port 3000.
set -e
cd "$(dirname "$0")/.."

# 1) Postgres (system service persists, but make sure)
pg_isready -h localhost -p 5432 >/dev/null 2>&1 || sudo -n service postgresql start

# 2) Dependencies
if [ ! -x node_modules/.bin/next ] || [ ! -x node_modules/.bin/prisma ]; then
  echo "[preview] restoring node_modules..."
  npm install --no-audit --no-fund
fi

# 3) Prisma client
[ -f node_modules/.prisma/client/index.js ] || ./node_modules/.bin/prisma generate

# 4) Production build (purged between sessions)
[ -f .next/BUILD_ID ] || NODE_OPTIONS=--max-old-space-size=1536 npm run build

# 5) Start server
exec npm start
