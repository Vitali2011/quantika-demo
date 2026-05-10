#!/usr/bin/env bash
set -euo pipefail

HOST="${QUANTIKA_DEMO_VPS_HOST:-185.249.225.169}"
REMOTE_PATH="/root/quantika-demo/.private/etms-corpus.json"
LOCAL_PATH=".private/etms-corpus.json"

if [[ ! -f "$LOCAL_PATH" ]]; then
  echo "ERROR: $LOCAL_PATH not found. Run npm run build:corpus first." >&2
  exit 1
fi

echo "Syncing $LOCAL_PATH → $HOST:$REMOTE_PATH ..."

ssh "root@$HOST" "mkdir -p /root/quantika-demo/.private && chmod 700 /root/quantika-demo/.private"
scp "$LOCAL_PATH" "root@$HOST:$REMOTE_PATH"
ssh "root@$HOST" "chmod 600 $REMOTE_PATH"

echo "Restarting pm2..."
ssh "root@$HOST" "cd /root/quantika-demo && npx pm2 restart quantika-demo"

echo "Done."
