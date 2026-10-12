#!/usr/bin/env bash
# Empire — resilient preview server: keeps npm start alive, restarting on exit.
cd "$(dirname "$0")/.."
while true; do
  bash scripts/preview.sh >> /tmp/empire-preview.log 2>&1
  echo "[preview-serve] server exited, restarting in 2s..." >> /tmp/empire-preview.log
  sleep 2
done
