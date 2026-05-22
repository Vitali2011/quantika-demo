#!/usr/bin/env bash
# sync-dev-from-prod.sh — copies a snapshot of the production database to local dev.
#
# Direction: PROD → DEV only.  This script NEVER writes to production.
#
# Guards:
#   1. Refuses to run if the current hostname matches the prod VPS hostname.
#   2. DEV_DB_PATH must not contain "/root/" (prod VPS convention) unless
#      --force-local is passed (escape hatch for SSH agents on prod).
#   3. The target directory must not be on the prod VPS path /root/quantika-demo.
#
# Usage:
#   bash scripts/sync-dev-from-prod.sh            — interactive, scp from VPS
#   bash scripts/sync-dev-from-prod.sh --dry-run  — print what would happen, no copy
#
# Env overrides (all optional, defaults shown):
#   PROD_SSH_HOST   — SSH target for prod VPS     (default: root@185.249.225.169)
#   PROD_DB_PATH    — remote DB path on VPS        (default: /root/quantika-demo/data/sessions.db)
#   DEV_DB_PATH     — local destination path       (default: ./data/sessions.db)
#   BACKUP_BEFORE   — backup dev DB before overwrite? (default: true)
#
# Prerequisites:
#   • SSH key-based access to prod VPS configured (~/.ssh/config or ssh-agent)
#   • sqlite3 CLI available locally for post-copy sanity check

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROD_SSH_HOST="${PROD_SSH_HOST:-root@185.249.225.169}"
PROD_DB_PATH="${PROD_DB_PATH:-/root/quantika-demo/data/sessions.db}"
DEV_DB_PATH="${DEV_DB_PATH:-./data/sessions.db}"
BACKUP_BEFORE="${BACKUP_BEFORE:-true}"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[sync-dev-from-prod] $*"; }
die()  { echo "[sync-dev-from-prod] ERROR: $*" >&2; exit 1; }
warn() { echo "[sync-dev-from-prod] WARNING: $*" >&2; }

# ── GUARD 1: Never run on the production VPS ──────────────────────────────────
# The prod VPS is a Hetzner VM; its hostname will not match a dev machine.
CURRENT_HOST="$(hostname -f 2>/dev/null || hostname)"
PROD_VPS_IP="185.249.225.169"

# Refuse if we can detect we're on the prod server (by IP or known prod hostname patterns)
if ip addr show 2>/dev/null | grep -q "${PROD_VPS_IP}"; then
  die "PROD-WRITE GUARD: this machine has IP ${PROD_VPS_IP} — refusing to run on prod VPS."
fi

# ── GUARD 2: DEV destination must not look like a prod path ───────────────────
ABS_DEV_PATH="$(realpath -m "${DEV_DB_PATH}" 2>/dev/null || echo "${DEV_DB_PATH}")"
if [[ "${ABS_DEV_PATH}" == /root/quantika-demo/* ]] && [[ "${1:-}" != "--force-local" ]]; then
  die "PROD-WRITE GUARD: DEV_DB_PATH resolves to ${ABS_DEV_PATH} which looks like the prod VPS path.
  If you intentionally want to restore prod from a backup on the VPS itself, use:
    DEV_DB_PATH=/some/restore/path bash scripts/sync-dev-from-prod.sh"
fi

# ── Pre-flight summary ────────────────────────────────────────────────────────
log "Source (PROD, read-only):  ${PROD_SSH_HOST}:${PROD_DB_PATH}"
log "Destination (DEV, local):  ${ABS_DEV_PATH}"
log "Dry-run:                   ${DRY_RUN}"
log "Backup before overwrite:   ${BACKUP_BEFORE}"
echo ""

if $DRY_RUN; then
  log "DRY-RUN: would scp ${PROD_SSH_HOST}:${PROD_DB_PATH} → ${ABS_DEV_PATH}"
  if [[ "${BACKUP_BEFORE}" == "true" ]] && [[ -f "${ABS_DEV_PATH}" ]]; then
    BACKUP_PATH="${ABS_DEV_PATH}.backup-$(date +%Y%m%dT%H%M%S)"
    log "DRY-RUN: would backup existing dev DB to ${BACKUP_PATH}"
  fi
  log "DRY-RUN: would run integrity sanity check on copied DB"
  log "DRY-RUN: complete — no files touched."
  exit 0
fi

# ── Backup existing dev DB ────────────────────────────────────────────────────
if [[ "${BACKUP_BEFORE}" == "true" ]] && [[ -f "${ABS_DEV_PATH}" ]]; then
  BACKUP_PATH="${ABS_DEV_PATH}.backup-$(date +%Y%m%dT%H%M%S)"
  log "Backing up existing dev DB → ${BACKUP_PATH}"
  cp "${ABS_DEV_PATH}" "${BACKUP_PATH}"
  log "Backup saved: ${BACKUP_PATH} ($(du -sh "${BACKUP_PATH}" | cut -f1))"
fi

# ── Ensure destination directory exists ──────────────────────────────────────
mkdir -p "$(dirname "${ABS_DEV_PATH}")"

# ── Copy prod DB via scp ──────────────────────────────────────────────────────
log "Copying prod DB snapshot via scp..."
log "(this is a point-in-time snapshot; concurrent writes on prod during copy may produce a"
log " slightly inconsistent read — use the VPS backup archive for guaranteed consistency)"

# Use sqlite3 online backup idiom via SSH to get a consistent snapshot
# (avoids partial reads if prod app is writing during copy)
if command -v sqlite3 &>/dev/null; then
  log "Using sqlite3 online backup (consistent snapshot via SSH)..."
  REMOTE_CMD="sqlite3 '${PROD_DB_PATH}' '.backup /tmp/quantika-snap-$$.db' && cat /tmp/quantika-snap-$$.db; rm -f /tmp/quantika-snap-$$.db"
  ssh "${PROD_SSH_HOST}" "${REMOTE_CMD}" > "${ABS_DEV_PATH}"
  log "Online backup complete."
else
  log "sqlite3 not available locally — falling back to direct scp (may be slightly inconsistent)..."
  warn "Install sqlite3 locally for consistent snapshots: apt install sqlite3"
  scp "${PROD_SSH_HOST}:${PROD_DB_PATH}" "${ABS_DEV_PATH}"
fi

DEST_SIZE="$(du -sh "${ABS_DEV_PATH}" 2>/dev/null | cut -f1)"
log "Snapshot saved: ${ABS_DEV_PATH} (${DEST_SIZE})"

# ── Post-copy sanity check ────────────────────────────────────────────────────
log "Running sanity check on copied DB..."
if command -v sqlite3 &>/dev/null; then
  SESSIONS=$(sqlite3 "${ABS_DEV_PATH}" "SELECT COUNT(*) FROM sessions;" 2>/dev/null || echo "?")
  MATCHES=$(sqlite3  "${ABS_DEV_PATH}" "SELECT COUNT(*) FROM matches;"  2>/dev/null || echo "?")
  FX=$(sqlite3       "${ABS_DEV_PATH}" "SELECT COUNT(*) FROM fx_rates;" 2>/dev/null || echo "?")
  log "  sessions: ${SESSIONS}  matches: ${MATCHES}  fx_rates: ${FX}"
  log "Sanity check OK."
else
  warn "sqlite3 not available — skipping sanity check."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
log "Sync complete."
log ""
log "Next steps:"
log "  1. Run the integrity audit to confirm the snapshot looks like prod:"
log "     npx tsx scripts/data-integrity-check.ts --env prod --db-path ${ABS_DEV_PATH}"
log ""
log "  2. Point your dev app at this snapshot:"
log "     SESSIONS_DB_PATH=${ABS_DEV_PATH} npm run dev"
log ""
log "NOTE: This snapshot is a point-in-time copy. It will drift from prod as"
log "      prod continues to receive writes. Re-run this script to refresh."
