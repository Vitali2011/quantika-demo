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

# Resolve the served DB the SAME way the app does, then migrate + seed THAT db.
# Root cause of #677: this step hardcoded data/sessions.db, but DEMO_MODE serves
# data/demo-seed.db (SESSIONS_DB_PATH in .env.local) — so the served DB was never
# migrated/seeded at deploy time and relied on the fragile, error-swallowing lazy
# first-request migration path. Source runtime env so we touch the right database.
if [ -f .env.local ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env.local
    set +a
fi
export SESSIONS_DB_PATH="${SESSIONS_DB_PATH:-data/sessions.db}"

echo "==> Migrating served DB ($SESSIONS_DB_PATH) to latest schema..."
npx tsx scripts/migrate.ts

echo "==> Seeding port-DA estimates ($SESSIONS_DB_PATH)..."
npx tsx scripts/seed-port-da.ts

echo "==> Restarting PM2 (--update-env picks up .env.local changes)..."
npx pm2 restart quantika-demo --update-env
npx pm2 save

echo "==> Health check..."
sleep 2
curl -fsS http://localhost:3000/api/health > /dev/null && echo "✓ DEPLOY OK"
