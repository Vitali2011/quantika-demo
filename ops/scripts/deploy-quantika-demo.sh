#!/usr/bin/env bash
# Auto-deploy for quantika-demo (Next.js + systemd unit `quantika-demo` on port 3000).
#
# Canonical source: ops/scripts/deploy-quantika-demo.sh (this repo).
# Installed copy:   /root/deploy-quantika-demo.sh on outreach-vps — self-updates
#                   from origin/main on every run, so fixes ship via PR only.
# Invoked by:       .github/workflows/deploy.yml → ssh (forced command
#                   /root/deploy.sh) → this script.
#
# Usage: deploy-quantika-demo.sh <sha>       — normal deploy
#        deploy-quantika-demo.sh --rollback  — emergency rollback to .last-deployed-sha.bak
#
# STAGED BUILD + ATOMIC SWAP (2026-06-11, fixes the per-deploy 500 window):
#   The previous version ran `npm ci` + `next build` inside the live dir.
#   Turbopack writes externalized native deps INTO .next (.next/node_modules/
#   better-sqlite3-*), so every deploy deleted files out from under the running
#   server → ~6 minutes of 500 on all SSR routes per deploy ("Failed to load
#   external module better-sqlite3", "Failed to load static file for page: /500").
#   Now: build happens in BUILD_DIR (separate clone); the live dir is touched
#   only in the flip step — mv renames on the same filesystem (instant) followed
#   immediately by systemctl restart. Old artifacts stay as .next.old /
#   node_modules.old for instant no-rebuild rollback.
#
# Exit codes: 0 deploy OK · 2 prod left broken (manual intervention needed) ·
#             1 anything else — deploy refused or failed; read the log to see
#             whether prod was left untouched (pre-flip failures: lock, fetch,
#             npm ci, build, BUILD_ID) or restored by rollback (post-flip).
set -uo pipefail

REPO_DIR="${QD_REPO_DIR:-/root/quantika-demo}"
BUILD_DIR="${QD_BUILD_DIR:-/root/quantika-demo-build}"
SERVICE="quantika-demo"
# localhost bypasses Caddy/CF — faster + isolated; external URL covered by uptime monitor
HEALTH_URL="${QD_HEALTH_URL:-http://localhost:3000/api/health}"
# / must render too: during the 2026-06-10 incident /api/health stayed 200
# (route module already in memory) while every page 500'd on missing .next files.
SMOKE_URL="${QD_SMOKE_URL:-http://localhost:3000/}"
LOCK_FILE="${QD_LOCK_FILE:-/tmp/deploy-${SERVICE}.lock}"
SHA_FILE="$HOME/.last-deployed-sha-${SERVICE}"
SHA_BACKUP="${SHA_FILE}.bak"
CANONICAL_PATH="ops/scripts/deploy-quantika-demo.sh"

log()  { echo "[$(date '+%H:%M:%S')] deploy-${SERVICE}: $*"; }
fail() { log "FATAL: $*"; exit 1; }

ARG1="${1:-}"
[[ -z "$ARG1" ]] && fail "usage: $0 <sha> | --rollback"

# ── Self-update from repo copy ───────────────────────────────────────────────
# mv is rename(2): atomic, and a concurrently running old copy keeps its inode —
# never edit the installed file in place. Offline (fetch fails) → run as-is.
if [[ -z "${DEPLOY_SELF_UPDATED:-}" && "${QD_SKIP_SELF_UPDATE:-0}" != "1" ]]; then
  SELF="$(readlink -f "$0")"
  if git -C "$REPO_DIR" fetch --quiet origin main 2>/dev/null \
     && git -C "$REPO_DIR" show "origin/main:${CANONICAL_PATH}" > "${SELF}.new" 2>/dev/null \
     && [[ -s "${SELF}.new" ]] \
     && ! cmp -s "${SELF}.new" "$SELF"; then
    cp -f "$SELF" "${SELF}.bak"
    chmod +x "${SELF}.new"
    mv -f "${SELF}.new" "$SELF"
    log "self-updated from origin/main:${CANONICAL_PATH} — re-exec"
    exec env DEPLOY_SELF_UPDATED=1 "$SELF" "$@"
  fi
  rm -f "${SELF}.new"
fi

# Acquire lock (concurrent deploy protection)
exec 200>"$LOCK_FILE"
flock -n 200 || fail "another deploy in progress (lock $LOCK_FILE)"

cd "$REPO_DIR" || fail "cannot cd to $REPO_DIR"

# restart + 30s warmup + health retry (6 × 10s = 60s window)
restart_and_health() {
  systemctl restart "$SERVICE" || { log "systemctl restart failed"; return 1; }
  log "warmup 30s..."
  sleep 30
  log "health check $HEALTH_URL (6 retries × 10s)..."
  local i
  for i in 1 2 3 4 5 6; do
    if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
      log "health OK on attempt $i"
      return 0
    fi
    log "  health attempt $i failed, retry in 10s..."
    sleep 10
  done
  return 1
}

smoke_root() {
  log "smoke check $SMOKE_URL (3 retries × 5s)..."
  local i
  for i in 1 2 3; do
    if curl -fsS --max-time 10 "$SMOKE_URL" > /dev/null 2>&1; then
      log "smoke OK: / renders (attempt $i)"
      return 0
    fi
    log "  smoke attempt $i failed (/ not 200), retry in 5s..."
    sleep 5
  done
  return 1
}

# Move a saved $1.old back into place (current $1, if any, parked as $1.failed).
# Returns 1 if there is no $1.old to restore.
restore_artifact() {
  [[ -d "$REPO_DIR/$1.old" ]] || return 1
  rm -rf "$REPO_DIR/$1.failed"
  if [[ -e "$REPO_DIR/$1" ]]; then
    mv "$REPO_DIR/$1" "$REPO_DIR/$1.failed" || return 1
  fi
  mv "$REPO_DIR/$1.old" "$REPO_DIR/$1"
}

# Swap previously-saved .old artifacts back into the live dir (instant rollback).
# $1 (optional): SHA the .old generation must belong to — recorded at flip time
# in .next.old/.rollback-sha. Guards --rollback against swapping in a stale
# generation after a deploy that failed pre-flip (which rewrites SHA_BACKUP
# without producing new .old artifacts). Returns 1 → caller rebuilds instead.
swap_back_old() {
  [[ -d "$REPO_DIR/.next.old" && -d "$REPO_DIR/node_modules.old" ]] || return 1
  if [[ -n "${1:-}" ]]; then
    local gen
    gen=$(cat "$REPO_DIR/.next.old/.rollback-sha" 2>/dev/null || echo "")
    if [[ "$gen" != "$1" ]]; then
      log ".old artifacts are generation '${gen:-unknown}', need $1 — rebuilding instead"
      return 1
    fi
  fi
  log "instant rollback: swapping .next.old + node_modules.old back in"
  restore_artifact .next || fail "swap-back .next failed"
  restore_artifact node_modules || fail "swap-back node_modules failed"
  return 0
}

# A mv failed mid-flip: the live dir may be missing artifacts RIGHT NOW.
# Restore whatever .old exists, restart, and report honestly — exiting without
# a restore here would leave prod 500ing indefinitely (#940 review FINDING-001).
flip_failed() {
  log "FLIP FAILED ($1) — restoring previous artifacts immediately"
  git reset --hard "$PREV_SHA" || log "WARN: git reset to PREV_SHA failed"
  restore_artifact .next || log "WARN: no .next.old to restore"
  restore_artifact node_modules || log "WARN: no node_modules.old to restore"
  if restart_and_health; then
    log "restore OK — prod back on $PREV_SHA after failed flip"
    exit 1
  fi
  log "RESTORE FAILED after mid-flip error — prod broken, MANUAL INTERVENTION!"
  exit 2
}

# ── Manual rollback path ─────────────────────────────────────────────────────
if [[ "$ARG1" == "--rollback" ]]; then
  TARGET_SHA=$(cat "$SHA_BACKUP" 2>/dev/null) || fail "no SHA_BACKUP found at $SHA_BACKUP"
  log "ROLLBACK to $TARGET_SHA"
  git reset --hard "$TARGET_SHA" || fail "rollback git reset failed"
  if ! swap_back_old "$TARGET_SHA"; then
    log "no .old artifacts — rebuilding previous version in place (slow path)"
    npm ci || log "WARN: npm ci on rollback failed (continuing)"
    NODE_OPTIONS='--max-old-space-size=8192' npm run build || fail "rollback build failed"
  fi
  if restart_and_health; then
    echo "$TARGET_SHA" > "$SHA_FILE"
    log "rollback OK — /health=200 on $TARGET_SHA"
    exit 1
  else
    log "ROLLBACK FAILED — /health not 200 on $TARGET_SHA, MANUAL INTERVENTION"
    exit 2
  fi
fi

# ── Normal deploy ────────────────────────────────────────────────────────────
GITHUB_SHA="$ARG1"
log "deploy SHA=$GITHUB_SHA"

PREV_SHA=$(git rev-parse HEAD) && [[ -n "$PREV_SHA" ]] || fail "cannot resolve current HEAD"
echo "$PREV_SHA" > "$SHA_BACKUP"
log "PREV_SHA=$PREV_SHA saved to $SHA_BACKUP"

git fetch origin main || fail "git fetch failed"
# Pin the deploy target once: build dir and live dir must flip to the SAME commit
# even if main moves mid-deploy.
TARGET_SHA=$(git rev-parse origin/main) || fail "cannot resolve origin/main"
log "target SHA=$TARGET_SHA (arg was $GITHUB_SHA)"

# Stage 1 — build in BUILD_DIR; live dir keeps serving the old version untouched.
if [[ ! -d "$BUILD_DIR/.git" ]]; then
  log "bootstrap: cloning build dir $BUILD_DIR..."
  git clone "$(git -C "$REPO_DIR" remote get-url origin)" "$BUILD_DIR" || fail "build dir clone failed"
fi
git -C "$BUILD_DIR" fetch origin main || fail "build dir fetch failed"
git -C "$BUILD_DIR" reset --hard "$TARGET_SHA" || fail "build dir reset failed"
# NEXT_PUBLIC_* are baked into the bundle at build time — build with prod env.
cp -f "$REPO_DIR/.env.local" "$BUILD_DIR/.env.local" || fail "copy .env.local to build dir failed"

log "npm ci (build dir)..."
( cd "$BUILD_DIR" && npm ci ) || fail "npm ci failed"

log "npm run build (build dir)..."
( cd "$BUILD_DIR" && NODE_OPTIONS='--max-old-space-size=8192' npm run build ) || fail "build failed"
[[ -s "$BUILD_DIR/.next/BUILD_ID" ]] || fail "build produced no .next/BUILD_ID — refusing to deploy"

# Stage 2 — flip live dir: code reset + artifact swap (mv renames, same fs,
# instant) + restart. The only degraded window is these few seconds.
log "flip: resetting live dir to $TARGET_SHA..."
git reset --hard "$TARGET_SHA" || fail "live git reset failed"

log "flip: swapping .next + node_modules..."
rm -rf "$REPO_DIR/.next.old" "$REPO_DIR/node_modules.old" "$REPO_DIR/.next.failed" "$REPO_DIR/node_modules.failed"
mv "$REPO_DIR/.next" "$REPO_DIR/.next.old" 2>/dev/null || true
# Record which generation .old belongs to — validated by --rollback (stale-gen guard).
echo "$PREV_SHA" > "$REPO_DIR/.next.old/.rollback-sha" 2>/dev/null || true
mv "$BUILD_DIR/.next" "$REPO_DIR/.next" || flip_failed "mv build .next into live"
mv "$REPO_DIR/node_modules" "$REPO_DIR/node_modules.old" 2>/dev/null || true
mv "$BUILD_DIR/node_modules" "$REPO_DIR/node_modules" || flip_failed "mv build node_modules into live"

log "restart + health + smoke..."
if ! { restart_and_health && smoke_root; }; then
  log "HEALTH/SMOKE FAILED — auto-rollback to $PREV_SHA"
  git reset --hard "$PREV_SHA" || fail "rollback reset failed (prod broken!)"
  if ! swap_back_old; then
    log "no .old artifacts — rebuilding previous version in place (slow path)"
    npm ci || log "WARN: rollback npm ci failed (continuing)"
    NODE_OPTIONS='--max-old-space-size=8192' npm run build || fail "rollback build failed"
  fi
  if restart_and_health; then
    log "ROLLBACK SUCCESS — prod restored on $PREV_SHA"
    exit 1
  else
    log "ROLLBACK FAILED — prod broken on $PREV_SHA too, MANUAL INTERVENTION!"
    exit 2
  fi
fi

# Eager schema migration of the served DB (#677): migrate the runtime-configured
# DB (SESSIONS_DB_PATH=demo-seed.db) at deploy time instead of relying on the
# fragile lazy first-request path. Idempotent; safe on every deploy.
log "migrate: served DB to latest schema..."
if cd "$REPO_DIR" && npx tsx --env-file=.env.local scripts/migrate.ts 2>&1 | tail -3; then
  log "migrate OK"
else
  log "WARN: migrate failed (app will lazy-migrate on first request)"
fi

# Post-deploy seed guards (idempotent — safe on every deploy)
log "seed guard: fx_rates..."
if cd "$REPO_DIR" && npx tsx --env-file=.env.local scripts/seed-fx-rates.ts 2>&1 | tail -3; then
  log "fx_rates seed OK"
else
  log "WARN: fx_rates seed failed (non-critical — app healthy)"
fi

# Success — record what is actually live (pinned TARGET_SHA; arg may be stale
# if main moved between merge and deploy).
echo "$TARGET_SHA" > "$SHA_FILE"
if [[ "$TARGET_SHA" != "$GITHUB_SHA" ]]; then
  log "DEPLOY OK — $TARGET_SHA live (arg was $GITHUB_SHA, main moved during deploy), /health=200, / smoked"
else
  log "DEPLOY OK — $TARGET_SHA live, /health=200, / smoked"
fi
exit 0
