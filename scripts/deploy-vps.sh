#!/usr/bin/env bash
set -euo pipefail
cd "${1:-/root/quantika-demo}"

echo "==> Self-updating deploy assets from origin/main..."
git fetch origin main
git checkout origin/main -- \
    scripts/deploy-vps.sh \
    ops/caddy/install-caddy-config.sh \
    ops/caddy/Caddyfile.demo

echo "==> Pulling latest main..."
git reset --hard origin/main

echo "==> Installing dependencies..."
npm ci

echo "==> Building (Node heap raised to 6GB to avoid OOM during type-check)..."
# `export` is required, not inline prefix — Next.js spawns child workers for the
# TypeScript checker that don't inherit single-command env. Verified on VPS:
# inline prefix → SIGABRT at ~2GB; export → build succeeds. 4096 was previously
# insufficient on this VPS (OOM observed 2026-05-07); raised to 6144 for headroom.
# Keep this in sync with scripts/redeploy.sh.
export NODE_OPTIONS="--max-old-space-size=6144"
npm run build
unset NODE_OPTIONS

echo "==> Installing Caddy config..."
bash ops/caddy/install-caddy-config.sh "$(pwd)"

echo "==> Seeding port-DA estimates..."
SESSIONS_DB_PATH=data/sessions.db npx tsx scripts/seed-port-da.ts

echo "==> Reloading PM2..."
npx pm2 reload quantika-demo
npx pm2 save

echo "==> Health check..."
sleep 2
curl -fsS http://localhost:3000/api/health > /dev/null && echo "✓ DEPLOY OK"
