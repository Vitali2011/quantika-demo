#!/usr/bin/env bash
# Ship the prod-only demo DB. Configure target via env:
#   DEMO_SSH_HOST   (e.g. outreach-vps)
#   DEMO_DB_REMOTE  (e.g. /root/quantika-demo/data/demo-seed.db)
set -euo pipefail

LOCAL_DB="${1:-data/demo-seed.db}"
: "${DEMO_SSH_HOST:?set DEMO_SSH_HOST}"
: "${DEMO_DB_REMOTE:?set DEMO_DB_REMOTE}"

if [[ ! -f "$LOCAL_DB" ]]; then
  echo "missing $LOCAL_DB — run npm run seed:all first" >&2
  exit 1
fi

echo "[deploy] backing up remote db…"
ssh "$DEMO_SSH_HOST" "test -f '$DEMO_DB_REMOTE' && cp '$DEMO_DB_REMOTE' '$DEMO_DB_REMOTE.bak' || true"

echo "[deploy] copying $LOCAL_DB → $DEMO_SSH_HOST:$DEMO_DB_REMOTE"
scp "$LOCAL_DB" "$DEMO_SSH_HOST:$DEMO_DB_REMOTE"

echo "[deploy] done. Ensure prod env has DEMO_MODE=true and SESSIONS_DB_PATH=$DEMO_DB_REMOTE, then restart the app."
