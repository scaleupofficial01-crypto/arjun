#!/usr/bin/env bash
# Empire — durable local Postgres bootstrap (self-healing).
# The sandbox wipes apt packages and non-workspace process state between
# sessions, so this script brings a local Postgres from "nothing installed"
# to "role + database from DATABASE_URL exist and server is reachable".
# Idempotent — safe to run on every preview start.
set -u
cd "$(dirname "$0")/.."

PORT=5432
ok() { node -e "
const net=require('net');const s=new net.Socket();s.setTimeout(1200);
s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)});
s.connect($PORT,'127.0.0.1');" ; }

if ok; then echo "[db-bootstrap] postgres already reachable"; exit 0; fi

# 1) Ensure postgres binaries exist
if ! sudo -n -u postgres true 2>/dev/null || [ ! -x /usr/lib/postgresql/17/bin/pg_ctl ]; then
  echo "[db-bootstrap] installing postgresql…"
  sudo -n apt-get install -y -q postgresql >/dev/null 2>&1 || {
    echo "[db-bootstrap] apt install failed"; exit 1; }
fi

# 2) Start the default cluster (no systemd in sandbox → pg_ctlcluster)
sudo -n -u postgres pg_ctlcluster 17 main start >/dev/null 2>&1 || true
sleep 1
if ! ok; then echo "[db-bootstrap] postgres did not come up"; tail -3 /var/log/postgresql/*.log 2>/dev/null; exit 1; fi
echo "[db-bootstrap] postgres up"

# 3) Ensure role + database from DATABASE_URL in credentials/.env
CREDS=$(node -e '
const m=require("fs").readFileSync("credentials/.env","utf8").match(/^DATABASE_URL="?(postgres(?:ql)?:\/\/)([^:\s]+):([^@\s]+)@([^\/\s]+)\/([^?\s"]+)/m);
if(!m)process.exit(1);
const q=s=>"\x27"+s.replace(/[\x27\\]/g,"\\$&")+"\x27";
console.log("DBUSER="+q(m[2]));console.log("DBPASS="+q(m[3]));console.log("DBNAME="+q(m[5]));')
eval "$CREDS"
sudo -n -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DBUSER'" | grep -q 1 || \
  sudo -n -u postgres psql -d postgres -qc "CREATE ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS' CREATEDB;"
sudo -n -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1 || \
  sudo -n -u postgres psql -d postgres -qc "CREATE DATABASE \"$DBNAME\" OWNER \"$DBUSER\";"
echo "[db-bootstrap] role '$DBUSER' + database '$DBNAME' ensured"
exit 0
