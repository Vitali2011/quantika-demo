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

echo "==> Building (Node heap raised to 4GB to avoid OOM during type-check)..."
NODE_OPTIONS="--max-old-space-size=4096" npm run build

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
