#!/bin/bash
# Redeploy helper: pull → preflight → build → restart.
# Aborts on any failure (set -e) — safest path to production.
set -e

echo "=== Redeploy: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

echo "[1/4] git pull"
git pull --ff-only

echo "[2/4] preflight (fail-fast on placeholders + USE_MIGRATION_RUNNER)"
PREFLIGHT_MODE=prod bash "$(dirname "$0")/preflight.sh"

echo "[3/4] npm install + build"
npm install --include=dev
npm run build

echo "[4/4] pm2 restart"
PM2_BIN="${PM2_BIN:-pm2}"
if ! command -v "$PM2_BIN" &>/dev/null; then
  PM2_BIN=/root/.npm-global/lib/node_modules/pm2/bin/pm2
fi
"$PM2_BIN" restart ecosystem.config.js

echo "=== Redeploy complete ==="
