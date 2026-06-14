#!/usr/bin/env bash
# post-deploy-seed.sh
#
# Idempotent post-deploy seed guard for quantika-demo.
# Runs after deploy + health check. Only seeds tables that are empty.
#
# Usage (called from deploy workflow or manually):
#   bash /root/scripts/ops/post-deploy-seed.sh
#
# Tables guarded:
#   fx_rates      — required for multi-currency display (MULTI_CURRENCY_V2_ENABLED)
#
# Idempotency contract: each check queries COUNT(*) — seeds only if 0 rows.
# Re-runs are safe: existing data is never overwritten.

set -euo pipefail

APP_DIR="${APP_DIR:-/root/quantika-demo}"
DB_PATH="${DB_PATH:-${APP_DIR}/data/sessions.db}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.local}"

log() {
  echo "[post-deploy-seed] $*"
}

seed_if_empty() {
  local table="$1"
  local script="$2"

  local count
  count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "0")

  if [ "${count}" = "0" ]; then
    log "Table '${table}' is empty — running seed: ${script}"
    (cd "${APP_DIR}" && npx tsx --env-file="${ENV_FILE}" "${script}")
    log "Table '${table}' seeded."
  else
    log "Table '${table}' already has ${count} rows — skipping seed."
  fi
}

log "Starting post-deploy seed guard (db: ${DB_PATH})"

seed_if_empty "fx_rates"    "scripts/seed-fx-rates.ts"

log "Post-deploy seed guard complete."
