#!/usr/bin/env bash
# backup.sh — daily tar.gz backup of critical Quantika files
#
# Triggered by: /etc/cron.d/quantika-backup at 00:00 UTC (03:00 BY)
# On success: POSTs heartbeat to /api/admin/cron-heartbeat
# On failure: exits non-zero; absent heartbeat triggers monitoring alert
#
# Usage:
#   ./backup.sh              — run backup
#   ./backup.sh --dry-run    — check sources/dirs, print what would be backed up
#
# Env overrides (all optional, defaults shown):
#   APP_DIR=/root/work/quantika-demo
#   BACKUP_DIR=/var/backups/quantika
#   DAILY_KEEP=7
#   WEEKLY_KEEP=4

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/root/work/quantika-demo}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/quantika}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
LOG_TAG="quantika-backup"

# ── Helpers ──────────────────────────────────────────────────────────────────
log() {
  local msg="[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*"
  echo "$msg" >&2
  logger -t "$LOG_TAG" "$*" 2>/dev/null || true
}
die() { log "ERROR: $*"; exit 1; }

# ── Resolve env from .env.local (CRON_SECRET, NEXT_PUBLIC_APP_URL) ───────────
ENV_FILE="${APP_DIR}/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  CRON_SECRET="${CRON_SECRET:-$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ')}"
  APP_URL="${APP_URL:-$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ')}"
fi
CRON_SECRET="${CRON_SECRET:-}"
APP_URL="${APP_URL:-}"

# ── Sources (priority order) ─────────────────────────────────────────────────
declare -a SOURCES=(
  "${APP_DIR}/.env.local"
  "/root/.config/gcp/quantika-vertex-ai.json"
  "${APP_DIR}/data/quantika.db"
  "${APP_DIR}/data/sessions.db"
)
# Add uploads dir only if it exists (not present in all envs)
[[ -d "${APP_DIR}/uploads" ]] && SOURCES+=("${APP_DIR}/uploads")

# ── Dry-run mode ─────────────────────────────────────────────────────────────
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

if $DRY_RUN; then
  log "DRY-RUN: checking sources..."
  ALL_OK=true
  for src in "${SOURCES[@]}"; do
    if [[ -e "$src" ]]; then
      SIZE=$(du -sh "$src" 2>/dev/null | cut -f1)
      log "  FOUND  $src ($SIZE)"
    else
      log "  MISSING $src"
      [[ "$src" == "${APP_DIR}/.env.local" || "$src" == "/root/.config/gcp/quantika-vertex-ai.json" ]] && ALL_OK=false
    fi
  done
  log "DRY-RUN: backup dir: ${BACKUP_DIR} (retention: ${DAILY_KEEP} daily / ${WEEKLY_KEEP} weekly)"
  log "DRY-RUN: heartbeat: ${APP_URL:-<APP_URL not set>}/api/admin/cron-heartbeat"
  log "DRY-RUN: CRON_SECRET: ${CRON_SECRET:+set (${#CRON_SECRET} chars)}"
  $ALL_OK || die "DRY-RUN: critical sources missing — backup would fail"
  log "DRY-RUN: OK — all critical sources present"
  exit 0
fi

# ── Pre-flight: critical files must exist ─────────────────────────────────────
[[ -f "${APP_DIR}/.env.local" ]] || die ".env.local missing — aborting"
SIZE=$(stat -c%s "${APP_DIR}/.env.local")
[[ $SIZE -gt 100 ]] || die ".env.local suspiciously small (${SIZE} bytes) — possible incident, aborting backup"

# ── Ensure backup dirs ────────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"
chmod 700 "${BACKUP_DIR}"

# ── Create daily archive ─────────────────────────────────────────────────────
TODAY=$(date +%Y-%m-%d)
DAILY_FILE="${BACKUP_DIR}/daily/quantika-backup-${TODAY}.tar.gz"

log "Creating: ${DAILY_FILE}"

# Capture individual file sizes for manifest
for src in "${SOURCES[@]}"; do
  [[ -e "$src" ]] && log "  + $src ($(du -sh "$src" 2>/dev/null | cut -f1))"
done

# Build the archive. Use || true on the tar command since --ignore-failed-read
# exits non-zero on vanished sparse inodes; the size check below catches real failures.
tar -czf "${DAILY_FILE}" \
  --ignore-failed-read \
  "${SOURCES[@]}" 2>/dev/null || true

ARCHIVE_SIZE=$(stat -c%s "${DAILY_FILE}" 2>/dev/null || echo 0)
[[ $ARCHIVE_SIZE -gt 200 ]] || die "Archive too small (${ARCHIVE_SIZE} bytes) — tar likely failed"

# Write sha256 checksum alongside archive
sha256sum "${DAILY_FILE}" > "${DAILY_FILE}.sha256"
log "Checksum: $(cat "${DAILY_FILE}.sha256")"

# ── Weekly snapshot (first run of each ISO week) ─────────────────────────────
WEEK=$(date +%Y-W%V)
WEEKLY_FILE="${BACKUP_DIR}/weekly/quantika-backup-${WEEK}.tar.gz"
if [[ ! -f "$WEEKLY_FILE" ]]; then
  cp "${DAILY_FILE}" "${WEEKLY_FILE}"
  sha256sum "${WEEKLY_FILE}" > "${WEEKLY_FILE}.sha256"
  log "Weekly snapshot saved: ${WEEKLY_FILE}"
fi

# ── Retention: prune old archives ────────────────────────────────────────────
prune_dir() {
  local dir="$1" keep="$2"
  # List by mtime descending; delete everything beyond $keep
  mapfile -t old < <(ls -1t "${dir}/quantika-backup-"*.tar.gz 2>/dev/null | tail -n +$((keep + 1)))
  for f in "${old[@]:-}"; do
    [[ -n "$f" ]] || continue
    rm -f "$f" "${f}.sha256"
    log "Pruned: $f"
  done
}
prune_dir "${BACKUP_DIR}/daily"  "$DAILY_KEEP"
prune_dir "${BACKUP_DIR}/weekly" "$WEEKLY_KEEP"

# ── Summary ───────────────────────────────────────────────────────────────────
HUMAN_SIZE=$(du -sh "${DAILY_FILE}" | cut -f1)
log "Backup complete: ${DAILY_FILE} (${HUMAN_SIZE})"
log "Daily backups kept: $(ls "${BACKUP_DIR}/daily/"*.tar.gz 2>/dev/null | wc -l)/${DAILY_KEEP}"
log "Weekly backups kept: $(ls "${BACKUP_DIR}/weekly/"*.tar.gz 2>/dev/null | wc -l)/${WEEKLY_KEEP}"

# ── Heartbeat ─────────────────────────────────────────────────────────────────
if [[ -n "$CRON_SECRET" && -n "$APP_URL" ]]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    -X POST "${APP_URL}/api/admin/cron-heartbeat" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -d '{"cron_name":"quantika-backup"}' 2>/dev/null) || HTTP_CODE="000"
  if [[ "$HTTP_CODE" == "200" ]]; then
    log "Heartbeat: OK (HTTP 200)"
  else
    log "WARNING: heartbeat returned HTTP ${HTTP_CODE} — app may be down"
    # Don't exit non-zero here: backup itself succeeded; heartbeat failure is a
    # separate concern tracked by the monitoring dashboard.
  fi
else
  log "WARNING: CRON_SECRET or APP_URL not set — heartbeat skipped"
fi
