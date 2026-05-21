#!/usr/bin/env bash
# verify-deploy.sh
#
# Post-deploy health check for quantika-demo.
# Runs on the VPS after deploy + restart; called from /root/deploy-quantika-demo.sh.
#
# Exit 0 = healthy. Exit 1 + clear message = broken.
#
# Usage (on VPS):
#   bash /root/quantika-demo/scripts/ops/verify-deploy.sh
#
# Env overrides (all optional):
#   APP_DIR     — default /root/quantika-demo
#   DB_PATH     — default $APP_DIR/data/sessions.db
#   ENV_FILE    — default $APP_DIR/.env.local
#   BASE_URL    — default http://localhost:3000
#   ADMIN_TOKEN — read from ENV_FILE if not set in environment

set -euo pipefail

APP_DIR="${APP_DIR:-/root/quantika-demo}"
DB_PATH="${DB_PATH:-${APP_DIR}/data/sessions.db}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.local}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

log()  { echo "[verify-deploy] $*"; }
fail() { echo "[verify-deploy] FAIL: $*" >&2; exit 1; }

# ── Read ADMIN_TOKEN from .env.local if not in environment ────────────────────
if [[ -z "${ADMIN_TOKEN:-}" && -f "$ENV_FILE" ]]; then
  ADMIN_TOKEN="$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ' || echo '')"
fi

# ── Check 1: Schema migrations ────────────────────────────────────────────────
log "Check 1: schema migrations..."

MIGRATION_COUNT="$(set +o pipefail; find "${APP_DIR}/lib/migrations/" -maxdepth 1 -name '[0-9][0-9][0-9]-*.ts' 2>/dev/null | wc -l | tr -d ' ')"
if [[ -z "$MIGRATION_COUNT" || "$MIGRATION_COUNT" -eq 0 ]]; then
  fail "Could not count migration files in ${APP_DIR}/lib/migrations/ — repo may not be checked out"
fi

MAX_VERSION="$(sqlite3 "${DB_PATH}" 'SELECT MAX(version) FROM schema_migrations;' 2>/dev/null || echo '')"
if [[ -z "$MAX_VERSION" ]]; then
  fail "Cannot query schema_migrations — DB may be missing or schema not initialised (path: ${DB_PATH})"
fi

if [[ "$MAX_VERSION" != "$MIGRATION_COUNT" ]]; then
  fail "Migration mismatch: DB MAX(version)=${MAX_VERSION}, migration files=${MIGRATION_COUNT}. Run migrations or check for failed apply. (path: ${DB_PATH})"
fi
log "  schema_migrations MAX(version)=${MAX_VERSION} matches ${MIGRATION_COUNT} migration files"

# ── Check 2: fx_rates seed ────────────────────────────────────────────────────
log "Check 2: fx_rates seed..."
FX_COUNT="$(sqlite3 "${DB_PATH}" 'SELECT COUNT(*) FROM fx_rates;' 2>/dev/null || echo '')"
if [[ -z "$FX_COUNT" ]]; then
  fail "Cannot query fx_rates table (path: ${DB_PATH}) — check if DB initialised"
fi
if [[ "$FX_COUNT" -le 0 ]]; then
  fail "fx_rates table is empty — run: bash ${APP_DIR}/scripts/ops/post-deploy-seed.sh"
fi
log "  fx_rates has ${FX_COUNT} rows"

# ── Check 3: Required env vars ────────────────────────────────────────────────
log "Check 3: required env vars..."
check_env_var() {
  local var="$1"
  local val="${!var:-}"

  if [[ -z "$val" && -f "$ENV_FILE" ]]; then
    val="$(grep -E "^${var}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ' || echo '')"
  fi

  if ! test -n "$val"; then
    fail "Required env var ${var} is not set — check ${ENV_FILE}"
  fi
  log "  ${var} is set"
}

check_env_var DATABASE_URL
check_env_var AI_PROVIDER
check_env_var AUTH_SECRET

# ── Check 4: /api/health ──────────────────────────────────────────────────────
log "Check 4: GET ${BASE_URL}/api/health..."
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}/api/health" 2>/dev/null || true)"
HTTP_CODE="${HTTP_CODE:-000}"
if [[ "$HTTP_CODE" != "200" ]]; then
  fail "/api/health returned HTTP ${HTTP_CODE} (expected 200) — check: pm2 status, pm2 logs quantika-demo"
fi
log "  /api/health -> HTTP 200"

# ── Check 5: /api/admin/knowledge-status ─────────────────────────────────────
log "Check 5: GET ${BASE_URL}/api/admin/knowledge-status..."
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  log "  SKIP: ADMIN_TOKEN not set — skipping knowledge-status check"
else
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" \
    "${BASE_URL}/api/admin/knowledge-status" 2>/dev/null || true)"
  HTTP_CODE="${HTTP_CODE:-000}"
  if [[ "$HTTP_CODE" != "200" ]]; then
    fail "/api/admin/knowledge-status returned HTTP ${HTTP_CODE} (expected 200) — check ADMIN_TOKEN in ${ENV_FILE}"
  fi
  log "  /api/admin/knowledge-status -> HTTP 200"
fi

log "All checks passed — deploy is healthy."
