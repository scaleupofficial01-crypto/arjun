#!/usr/bin/env bash
# Empire — demo-content seeder (idempotent). If the demo workspace has no
# journals, it posts a small realistic set THROUGH THE REAL API so all P&L
# math is server-computed exactly like user-entered data.
# Requires the app to be running (default http://localhost:3000).
set -u
BASE="${1:-http://localhost:3000}"
CJ=$(mktemp)
trap "rm -f $CJ" EXIT

curl -s -m 5 -c "$CJ" -o /dev/null "$BASE/dashboard" || exit 0
EXISTING=$(curl -s -m 5 -b "$CJ" "$BASE/api/journals")
echo "$EXISTING" | grep -q '"id"' && { echo "[seed-demo] data present, skip"; exit 0; }

echo "[seed-demo] empty workspace — seeding demo content…"
J=$(curl -s -b "$CJ" -X POST "$BASE/api/journals" -H 'content-type: application/json' \
  -d '{"name":"Futures 2026","description":"NIFTY/BANKNIFTY futures playbook"}')
JID=$(echo "$J" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).journal.id))")
G=$(curl -s -b "$CJ" -X POST "$BASE/api/journals/$JID/groups" -H 'content-type: application/json' -d '{"name":"October"}')
GID=$(echo "$G" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).group.id))")

trade() { curl -s -o /dev/null -b "$CJ" -X POST "$BASE/api/trades" -H 'content-type: application/json' -d "$1"; }
trade "{\"journalId\":\"$JID\",\"groupId\":\"$GID\",\"symbol\":\"NIFTY24OCTFUT\",\"side\":\"BUY\",\"quantity\":\"75\",\"entryPrice\":\"24480.50\",\"exitPrice\":\"24580.50\",\"entryAt\":\"2026-10-06T04:15:00.000Z\",\"exitAt\":\"2026-10-06T09:45:00.000Z\",\"setupTag\":\"ORB breakout\",\"notes\":\"Clean opening range break, scaled out at target\"}"
trade "{\"journalId\":\"$JID\",\"groupId\":\"$GID\",\"symbol\":\"BANKNIFTY24OCTFUT\",\"side\":\"SELL\",\"quantity\":\"40\",\"entryPrice\":\"51880.00\",\"exitPrice\":\"51725.50\",\"entryAt\":\"2026-10-08T06:30:00.000Z\",\"exitAt\":\"2026-10-08T10:20:00.000Z\",\"setupTag\":\"VWAP rejection\",\"notes\":\"Rejected vwap twice, rode the flush\"}"
trade "{\"journalId\":\"$JID\",\"groupId\":\"$GID\",\"symbol\":\"NIFTY24OCTFUT\",\"side\":\"BUY\",\"quantity\":\"75\",\"entryPrice\":\"24710.00\",\"exitPrice\":\"24666.40\",\"entryAt\":\"2026-10-10T05:00:00.000Z\",\"exitAt\":\"2026-10-10T08:10:00.000Z\",\"setupTag\":\"Breakout retest\",\"notes\":\"Retest failed, cut fast per plan\"}"
trade "{\"journalId\":\"$JID\",\"groupId\":\"$GID\",\"symbol\":\"CRUDEOIL24OCTFUT\",\"side\":\"BUY\",\"quantity\":\"1\",\"entryPrice\":\"5890.00\",\"entryAt\":\"2026-10-13T04:45:00.000Z\",\"setupTag\":\"Range bottom\",\"notes\":\"Open position — holding into inventory data\"}"

W=$(curl -s -b "$CJ" -X POST "$BASE/api/watchlists" -H 'content-type: application/json' -d '{"name":"Crypto + Macro"}')
WID=$(echo "$W" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).watchlist.id))")
for S in BTCUSD ETHUSD EURUSD; do
  curl -s -o /dev/null -b "$CJ" -X POST "$BASE/api/watchlists/$WID/items" -H 'content-type: application/json' -d "{\"symbol\":\"$S\"}"
done
echo "[seed-demo] done: journal '$JID', 4 trades, watchlist '$WID'"
