#!/usr/bin/env bash
set -euo pipefail
cd "${1:-/root/quantika-demo}"
echo "==> Pulling latest main..."
git fetch origin main
git reset --hard origin/main
echo "==> Installing dependencies..."
npm ci
echo "==> Building..."
npm run build
echo "==> Installing Caddy config..."
bash ops/caddy/install-caddy-config.sh "$(pwd)"
echo "==> Seeding port-DA estimates..."
SESSIONS_DB_PATH=data/sessions.db npx tsx scripts/seed-port-da.ts
echo "==> Reloading PM2..."
pm2 reload quantika-demo
pm2 save
echo "==> Health check..."
sleep 2
curl -fsS http://localhost:3000/api/health > /dev/null && echo "✓ DEPLOY OK"
