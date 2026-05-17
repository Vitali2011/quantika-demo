#!/usr/bin/env bash
# restore-test.sh — verifies that the latest backup can be fully restored
#
# Extracts the most recent daily backup into a temp dir and checks:
#   1. sha256 checksum matches
#   2. .env.local exists and is non-trivially sized (> 100 bytes)
#   3. GCP JSON creds parse as valid JSON
#   4. SQLite .db files are present
#
# Usage:
#   ./restore-test.sh                      — test latest daily backup
#   ./restore-test.sh /path/to/backup.tar.gz  — test a specific archive
#
# Exits 0 on PASS, 1 on FAIL.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/quantika}"
TARGET="${1:-}"
PASS_COUNT=0
FAIL_COUNT=0

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*"; }
pass() { log "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { log "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
die()  { log "ERROR: $*"; exit 1; }

# ── Find archive ──────────────────────────────────────────────────────────────
if [[ -n "$TARGET" ]]; then
  ARCHIVE="$TARGET"
else
  ARCHIVE=$(ls -1t "${BACKUP_DIR}/daily/quantika-backup-"*.tar.gz 2>/dev/null | head -1)
fi
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || die "No backup archive found (checked: ${BACKUP_DIR}/daily/)"

log "Testing: $ARCHIVE"
log "Archive size: $(du -sh "$ARCHIVE" | cut -f1)"

# ── Checksum verification ─────────────────────────────────────────────────────
CHECKSUM_FILE="${ARCHIVE}.sha256"
if [[ -f "$CHECKSUM_FILE" ]]; then
  if (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null 2>&1); then
    pass "sha256 checksum verified"
  else
    fail "sha256 checksum MISMATCH — archive may be corrupted"
  fi
else
  fail "Checksum file missing: $CHECKSUM_FILE"
fi

# ── Extract to temp dir ───────────────────────────────────────────────────────
TEST_DIR=$(mktemp -d /tmp/quantika-restore-test.XXXXXX)
trap 'rm -rf "$TEST_DIR"' EXIT

if tar -xzf "$ARCHIVE" -C "$TEST_DIR" 2>/dev/null; then
  pass "Extraction successful"
else
  die "tar extraction failed — aborting further checks"
fi

# ── .env.local ────────────────────────────────────────────────────────────────
ENV_FILE=$(find "$TEST_DIR" -name ".env.local" 2>/dev/null | head -1)
if [[ -n "$ENV_FILE" ]]; then
  ENV_SIZE=$(stat -c%s "$ENV_FILE")
  if [[ $ENV_SIZE -gt 100 ]]; then
    pass ".env.local present (${ENV_SIZE} bytes)"
  else
    fail ".env.local too small (${ENV_SIZE} bytes) — likely truncated/corrupted"
  fi
  # Cross-check with live file if available
  LIVE_ENV="/root/work/quantika-demo/.env.local"
  if [[ -f "$LIVE_ENV" ]]; then
    BACKUP_CKSUM=$(sha256sum "$ENV_FILE" | cut -d' ' -f1)
    LIVE_CKSUM=$(sha256sum "$LIVE_ENV" | cut -d' ' -f1)
    if [[ "$BACKUP_CKSUM" == "$LIVE_CKSUM" ]]; then
      pass ".env.local matches live file (checksums identical)"
    else
      log "NOTE: .env.local differs from live — expected if file changed since backup"
    fi
  fi
else
  fail ".env.local NOT found in backup — critical file missing"
fi

# ── GCP JSON creds ────────────────────────────────────────────────────────────
GCP_FILE=$(find "$TEST_DIR" -name "quantika-vertex-ai.json" 2>/dev/null | head -1)
if [[ -n "$GCP_FILE" ]]; then
  if python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$GCP_FILE" 2>/dev/null; then
    GCP_SIZE=$(stat -c%s "$GCP_FILE")
    pass "GCP creds valid JSON (${GCP_SIZE} bytes)"
  else
    fail "GCP creds not valid JSON — file corrupted"
  fi
else
  fail "quantika-vertex-ai.json NOT found in backup"
fi

# ── SQLite databases ──────────────────────────────────────────────────────────
mapfile -t DB_FILES < <(find "$TEST_DIR" -name "*.db" 2>/dev/null)
if [[ ${#DB_FILES[@]} -gt 0 ]]; then
  for db in "${DB_FILES[@]}"; do
    DB_SIZE=$(stat -c%s "$db")
    pass "$(basename "$db") present (${DB_SIZE} bytes)"
    # SQLite magic bytes check: first 16 bytes must start with "SQLite format 3"
    MAGIC=$(head -c 15 "$db" 2>/dev/null || true)
    if [[ "$MAGIC" == "SQLite format 3" ]]; then
      pass "$(basename "$db") SQLite magic bytes OK"
    else
      fail "$(basename "$db") missing SQLite magic bytes — may be corrupted"
    fi
  done
else
  fail "No .db files found in backup"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Restore test result: ${PASS_COUNT} PASS / ${FAIL_COUNT} FAIL"
log "Archive: $ARCHIVE"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $FAIL_COUNT -gt 0 ]]; then
  log "RESULT: FAILED — backup is not reliably restorable"
  exit 1
else
  log "RESULT: PASSED — backup verified OK"
  exit 0
fi
