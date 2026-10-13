#!/usr/bin/env bash
# Empire — local preview alert poller (production uses Vercel Cron instead).
# Calls /api/cron/alerts with the CRON_SECRET every 30s so price alerts fire
# from real fetched prices continuously in the sandbox.
cd "$(dirname "$0")/.."
set -a; . ./credentials/.env; set +a
while true; do
  curl -s -o /dev/null -w "[poller] cron/alerts -> %{http_code}\n" \
    -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/alerts \
    >> /tmp/empire-poller.log 2>&1
  sleep 30
done
