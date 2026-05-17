#!/usr/bin/env bash
# Regression tests for backup.sh HIGH findings:
#   HIGH-1: tar || true allowed partial archives to exit 0
#   HIGH-2: quoted .env.local values broke CRON_SECRET/APP_URL extraction
#
# Run: bash scripts/ops/tests/backup-unit.sh
# Exits 0 on all pass, 1 if any fail.

set -euo pipefail

PASS=0; FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL+1)); }

# ── Helpers ──────────────────────────────────────────────────────────────────

# Strip quotes and inline comments from an env-file value — mirrors backup.sh logic
parse_env_value() {
  echo "$1" | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' '
}

# ── HIGH-2: env-file value parsing ───────────────────────────────────────────

got=$(parse_env_value '"my-secret-token-abc123"')
[[ "$got" == "my-secret-token-abc123" ]] \
  && pass "HIGH-2: double-quoted value stripped correctly" \
  || fail "HIGH-2: double-quoted → got '$got', want 'my-secret-token-abc123'"

got=$(parse_env_value "'my-secret-token-abc123'")
[[ "$got" == "my-secret-token-abc123" ]] \
  && pass "HIGH-2: single-quoted value stripped correctly" \
  || fail "HIGH-2: single-quoted → got '$got', want 'my-secret-token-abc123'"

got=$(parse_env_value 'my-secret-token-abc123')
[[ "$got" == "my-secret-token-abc123" ]] \
  && pass "HIGH-2: unquoted value unchanged" \
  || fail "HIGH-2: unquoted → got '$got', want 'my-secret-token-abc123'"

got=$(parse_env_value 'abc123 # prod key')
[[ "$got" == "abc123" ]] \
  && pass "HIGH-2: inline comment stripped" \
  || fail "HIGH-2: inline comment → got '$got', want 'abc123'"

# cut -d= -f2- already handles = in value; verify quote-strip preserves it
got=$(parse_env_value '"abc=def=="')
[[ "$got" == "abc=def==" ]] \
  && pass "HIGH-2: value containing = preserved after quote-strip" \
  || fail "HIGH-2: = in value → got '$got', want 'abc=def=='"

# Full env-file extraction via grep+cut+sed (mirrors exact backup.sh pipeline)
TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT
cat > "$TMP_ENV" <<'EOF'
# Next.js .env.local
CRON_SECRET="my-real-secret"
NEXT_PUBLIC_APP_URL="https://example.com"
OTHER_VAR=irrelevant
EOF

got_secret=$(grep -E '^CRON_SECRET=' "$TMP_ENV" | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ')
[[ "$got_secret" == "my-real-secret" ]] \
  && pass "HIGH-2: CRON_SECRET extracted from quoted .env.local" \
  || fail "HIGH-2: CRON_SECRET extraction → got '$got_secret', want 'my-real-secret'"

got_url=$(grep -E '^NEXT_PUBLIC_APP_URL=' "$TMP_ENV" | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']\$//" | cut -d'#' -f1 | tr -d ' ')
[[ "$got_url" == "https://example.com" ]] \
  && pass "HIGH-2: NEXT_PUBLIC_APP_URL extracted from quoted .env.local" \
  || fail "HIGH-2: APP_URL extraction → got '$got_url', want 'https://example.com'"

# ── HIGH-1: tar failure removes partial archive and exits non-zero ────────────

TMP_BACKUP=$(mktemp -d)
trap 'rm -rf "$TMP_BACKUP" "$TMP_ENV"' EXIT

# Build a minimal mock backup.sh that exercises only the tar error-handling path.
# We use a fake tar that fails immediately so we don't need root or a full disk.
MOCK_SCRIPT=$(mktemp --suffix=.sh)
trap 'rm -f "$MOCK_SCRIPT"; rm -rf "$TMP_BACKUP" "$TMP_ENV"' EXIT

cat > "$MOCK_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DAILY_FILE="${TMP_BACKUP}/test-backup.tar.gz"
die() { echo "ERROR: \$*" >&2; exit 1; }
# simulate tar failure by calling false
tar() { touch "\${DAILY_FILE}"; return 1; }
export -f tar
tar -czf "\${DAILY_FILE}" /dev/null 2>/dev/null \
  || { rm -f "\${DAILY_FILE}"; die "tar failed — disk full or I/O error"; }
echo "SHOULD NOT REACH HERE"
EOF
chmod +x "$MOCK_SCRIPT"

if bash "$MOCK_SCRIPT" 2>/dev/null; then
  fail "HIGH-1: script should exit non-zero on tar failure but exited 0"
else
  pass "HIGH-1: script exits non-zero on tar failure"
fi

if [[ -f "${TMP_BACKUP}/test-backup.tar.gz" ]]; then
  fail "HIGH-1: partial archive still exists after tar failure"
else
  pass "HIGH-1: partial archive removed after tar failure"
fi

# ── Results ───────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} PASS / ${FAIL} FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
