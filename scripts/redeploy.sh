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
# `export` is required, not inline prefix — Next.js spawns child workers for the
# TypeScript checker that don't inherit single-command env. Verified on VPS:
# inline prefix → SIGABRT at ~2GB; export → build succeeds. 4096 was previously
# insufficient on this VPS (OOM observed 2026-05-07); raised to 6144 for headroom.
# Keep this in sync with scripts/deploy-vps.sh.
export NODE_OPTIONS="--max-old-space-size=6144"
npm run build
unset NODE_OPTIONS

echo "[4/4] pm2 restart"
PM2_BIN="${PM2_BIN:-pm2}"
if ! command -v "$PM2_BIN" &>/dev/null; then
  PM2_BIN=/root/.npm-global/lib/node_modules/pm2/bin/pm2
fi
"$PM2_BIN" restart ecosystem.config.js

echo "=== Redeploy complete ==="
