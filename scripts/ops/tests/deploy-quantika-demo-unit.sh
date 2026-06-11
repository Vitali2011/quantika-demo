#!/usr/bin/env bash
# Regression tests for ops/scripts/deploy-quantika-demo.sh (staged build + atomic swap).
#
# Root cause being guarded (2026-06-10 incident): the old VPS script ran
# `npm ci` + `next build` IN the live dir — turbopack writes externalized native
# deps into .next/node_modules/, so every deploy deleted modules out from under
# the running server → ~6 min of 500s on all SSR routes per deploy.
#
# Contract under test:
#   T1: happy path — build runs in BUILD_DIR before any restart; artifacts are
#       mv-swapped into the live dir; .old kept; SHA files written; / smoked.
#   T2: build failure — live dir untouched, NO restart, exit != 0.
#   T3: missing BUILD_ID after "successful" build — refuse to deploy.
#   T4: health check fails after restart — instant swap-back rollback, exit 1.
#   T5: / smoke fails (health 200 but pages broken) — rollback too, exit 1.
#   T6: --rollback with .old artifacts present — instant swap-back, no rebuild.
#
# Run: bash scripts/ops/tests/deploy-quantika-demo-unit.sh
# All external commands (git/npm/npx/systemctl/curl/flock/sleep) are PATH-mocked;
# nothing real is restarted or fetched.

set -u

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/ops/scripts/deploy-quantika-demo.sh"

PASS=0; FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL+1)); }

[[ -f "$SCRIPT" ]] || { echo "FATAL: $SCRIPT not found"; exit 1; }
bash -n "$SCRIPT" && pass "script parses (bash -n)" || fail "script has syntax errors"

# ── Sandbox setup ────────────────────────────────────────────────────────────

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
MOCKBIN="$SANDBOX/bin"
mkdir -p "$MOCKBIN"

export CMDLOG="$SANDBOX/cmd.log"
export MOCK_STATE="$SANDBOX/state"

# git mock: records calls, simulates rev-parse/fetch/clone/reset/show
cat > "$MOCKBIN/git" <<'EOF'
#!/bin/bash
echo "git $*" >> "$CMDLOG"
# strip -C <dir> prefix for matching, remember the dir
DIR=""
if [ "$1" = "-C" ]; then DIR="$2"; shift 2; fi
case "$1" in
  rev-parse)
    case "$2" in
      HEAD)        echo "prevsha1111111111111111111111111111111111" ;;
      origin/main) echo "targetsha22222222222222222222222222222222" ;;
      *)           echo "othersha333333333333333333333333333333333" ;;
    esac ;;
  fetch) exit 0 ;;
  remote) echo "git@example.com:fake/repo.git" ;;
  clone) mkdir -p "$3/.git"; exit 0 ;;
  reset) exit 0 ;;
  show)  exit 1 ;;  # self-update path: no repo copy available
  *) exit 0 ;;
esac
EOF

# npm mock: ci → node_modules; run build → .next (+BUILD_ID unless told not to)
cat > "$MOCKBIN/npm" <<'EOF'
#!/bin/bash
echo "npm $* pwd=$PWD" >> "$CMDLOG"
if [ "$1" = "ci" ]; then
  [ "${FAIL_NPM_CI:-0}" = "1" ] && exit 1
  mkdir -p node_modules
  echo "nm-new" > node_modules/marker
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  [ "${FAIL_BUILD:-0}" = "1" ] && exit 1
  mkdir -p .next
  echo "from-build" > .next/marker
  if [ "${FAIL_NO_BUILDID:-0}" != "1" ]; then
    echo "build-id-123" > .next/BUILD_ID
  fi
  exit 0
fi
exit 0
EOF

# systemctl / npx / flock / sleep mocks
cat > "$MOCKBIN/systemctl" <<'EOF'
#!/bin/bash
echo "systemctl $*" >> "$CMDLOG"
exit 0
EOF
cat > "$MOCKBIN/npx" <<'EOF'
#!/bin/bash
echo "npx $*" >> "$CMDLOG"
exit 0
EOF
cat > "$MOCKBIN/flock" <<'EOF'
#!/bin/bash
exit 0
EOF
cat > "$MOCKBIN/sleep" <<'EOF'
#!/bin/bash
exit 0
EOF

# curl mock: /api/health fails first N attempts (HEALTH_FAIL_FIRST_N),
# / (smoke) fails always when FAIL_SMOKE=1
cat > "$MOCKBIN/curl" <<'EOF'
#!/bin/bash
echo "curl $*" >> "$CMDLOG"
case "$*" in
  *"/api/health"*)
    N=0
    [ -f "$MOCK_STATE/health_count" ] && N=$(cat "$MOCK_STATE/health_count")
    N=$((N+1)); mkdir -p "$MOCK_STATE"; echo "$N" > "$MOCK_STATE/health_count"
    [ "$N" -le "${HEALTH_FAIL_FIRST_N:-0}" ] && exit 22
    exit 0 ;;
  *)
    [ "${FAIL_SMOKE:-0}" = "1" ] && exit 22
    exit 0 ;;
esac
EOF
chmod +x "$MOCKBIN"/*

# Fresh sandbox repo+home per test
setup_dirs() {
  rm -rf "$SANDBOX/repo" "$SANDBOX/build" "$SANDBOX/home" "$MOCK_STATE"
  rm -f "$CMDLOG" "$SANDBOX/lock"
  mkdir -p "$SANDBOX/repo/.next" "$SANDBOX/repo/node_modules" "$SANDBOX/home" "$MOCK_STATE"
  echo "live-old" > "$SANDBOX/repo/.next/marker"
  echo "old-build-id" > "$SANDBOX/repo/.next/BUILD_ID"
  echo "nm-old" > "$SANDBOX/repo/node_modules/marker"
  echo "SOME_VAR=1" > "$SANDBOX/repo/.env.local"
  : > "$CMDLOG"
  echo 0 > "$MOCK_STATE/health_count"
}

run_deploy() {  # args: extra env assignments... — runs script, captures rc+output
  OUT="$SANDBOX/out.txt"
  env PATH="$MOCKBIN:$PATH" \
      HOME="$SANDBOX/home" \
      QD_REPO_DIR="$SANDBOX/repo" \
      QD_BUILD_DIR="$SANDBOX/build" \
      QD_LOCK_FILE="$SANDBOX/lock" \
      QD_SKIP_SELF_UPDATE=1 \
      CMDLOG="$CMDLOG" MOCK_STATE="$MOCK_STATE" \
      "$@" \
      bash "$SCRIPT" "${DEPLOY_ARG:-somesha}" > "$OUT" 2>&1
  RC=$?
}

lineno() { grep -n "$1" "$CMDLOG" | head -1 | cut -d: -f1; }

# ── T1: happy path ───────────────────────────────────────────────────────────

setup_dirs
DEPLOY_ARG="somesha" run_deploy

[[ $RC -eq 0 ]] \
  && pass "T1: happy path exits 0" \
  || { fail "T1: expected rc=0, got rc=$RC"; sed 's/^/  | /' "$SANDBOX/out.txt" | tail -15; }

CI_LINE=$(lineno "npm ci")
BUILD_LINE=$(lineno "npm run build")
RESTART_LINE=$(lineno "systemctl restart")
if [[ -n "$CI_LINE" && -n "$BUILD_LINE" && -n "$RESTART_LINE" \
      && "$CI_LINE" -lt "$BUILD_LINE" && "$BUILD_LINE" -lt "$RESTART_LINE" ]]; then
  pass "T1: order is npm ci → npm run build → systemctl restart"
else
  fail "T1: bad order (ci=$CI_LINE build=$BUILD_LINE restart=$RESTART_LINE)"
fi

grep -q "npm run build pwd=$SANDBOX/build" "$CMDLOG" \
  && pass "T1: build runs in BUILD_DIR, not live dir" \
  || fail "T1: build did not run in BUILD_DIR ($(grep 'npm run build' "$CMDLOG"))"

[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "from-build" ]] \
  && pass "T1: live .next swapped to fresh build" \
  || fail "T1: live .next not swapped (marker=$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null))"

[[ "$(cat "$SANDBOX/repo/.next.old/marker" 2>/dev/null)" == "live-old" ]] \
  && pass "T1: previous .next kept as .next.old (instant rollback)" \
  || fail "T1: .next.old missing or wrong"

[[ "$(cat "$SANDBOX/repo/node_modules/marker" 2>/dev/null)" == "nm-new" ]] \
  && pass "T1: live node_modules swapped to fresh install" \
  || fail "T1: node_modules not swapped"

grep -q "git clone" "$CMDLOG" \
  && pass "T1: build dir bootstrapped via git clone on first run" \
  || fail "T1: no git clone for missing build dir"

[[ "$(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo" 2>/dev/null)" == "targetsha22222222222222222222222222222222" ]] \
  && pass "T1: deployed SHA recorded" \
  || fail "T1: SHA file wrong: $(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo" 2>/dev/null)"

[[ "$(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak" 2>/dev/null)" == "prevsha1111111111111111111111111111111111" ]] \
  && pass "T1: previous SHA backed up" \
  || fail "T1: SHA backup wrong"

grep -q 'curl.*localhost:3000/$' "$CMDLOG" \
  && pass "T1: / smoke-checked after restart" \
  || fail "T1: no smoke curl of / found"

# ── T2: build failure → live untouched, no restart ──────────────────────────

setup_dirs
run_deploy FAIL_BUILD=1

[[ $RC -ne 0 ]] \
  && pass "T2: build failure exits non-zero" \
  || fail "T2: build failure exited 0"

grep -q "systemctl restart" "$CMDLOG" \
  && fail "T2: service was restarted despite build failure" \
  || pass "T2: no restart on build failure"

[[ "$(cat "$SANDBOX/repo/.next/marker")" == "live-old" ]] \
  && pass "T2: live .next untouched on build failure" \
  || fail "T2: live .next modified on build failure"

# ── T3: build "succeeds" but no BUILD_ID → refuse ────────────────────────────

setup_dirs
run_deploy FAIL_NO_BUILDID=1

[[ $RC -ne 0 ]] && grep -qi "BUILD_ID" "$SANDBOX/out.txt" \
  && pass "T3: missing BUILD_ID refused with explicit message" \
  || fail "T3: missing BUILD_ID not caught (rc=$RC)"

grep -q "systemctl restart" "$CMDLOG" \
  && fail "T3: restarted despite missing BUILD_ID" \
  || pass "T3: no restart when BUILD_ID missing"

# ── T4: health fails after restart → instant swap-back rollback ─────────────

setup_dirs
run_deploy HEALTH_FAIL_FIRST_N=6

[[ $RC -eq 1 ]] \
  && pass "T4: failed health → rollback path exits 1" \
  || fail "T4: expected rc=1, got rc=$RC"

[[ "$(cat "$SANDBOX/repo/.next/marker")" == "live-old" ]] \
  && pass "T4: live .next swapped back to previous build" \
  || fail "T4: rollback did not restore .next (marker=$(cat "$SANDBOX/repo/.next/marker"))"

[[ "$(cat "$SANDBOX/repo/node_modules/marker")" == "nm-old" ]] \
  && pass "T4: node_modules swapped back" \
  || fail "T4: rollback did not restore node_modules"

RESTARTS=$(grep -c "systemctl restart" "$CMDLOG")
[[ "$RESTARTS" -ge 2 ]] \
  && pass "T4: service restarted again after swap-back" \
  || fail "T4: only $RESTARTS restart(s) — rollback never restarted"

grep -q "npm run build pwd=$SANDBOX/repo" "$CMDLOG" \
  && fail "T4: rollback rebuilt in live dir (should be instant swap-back)" \
  || pass "T4: rollback is instant (no rebuild)"

# ── T5: health OK but / smoke fails → rollback ───────────────────────────────

setup_dirs
run_deploy FAIL_SMOKE=1

[[ $RC -eq 1 ]] \
  && pass "T5: failed / smoke → rollback, exit 1" \
  || fail "T5: expected rc=1, got rc=$RC (smoke regression: /api/health alone stayed 200 during 2026-06-10 incident)"

[[ "$(cat "$SANDBOX/repo/.next/marker")" == "live-old" ]] \
  && pass "T5: live .next restored after smoke failure" \
  || fail "T5: .next not restored after smoke failure"

# ── T6: --rollback with .old present → instant swap-back, no rebuild ────────

setup_dirs
mkdir -p "$SANDBOX/repo/.next.old" "$SANDBOX/repo/node_modules.old"
echo "live-older" > "$SANDBOX/repo/.next.old/marker"
echo "nm-older" > "$SANDBOX/repo/node_modules.old/marker"
echo "rollbacktarget444444444444444444444444444" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
DEPLOY_ARG="--rollback" run_deploy

[[ $RC -eq 1 ]] \
  && pass "T6: --rollback exits 1 (rollback-success contract)" \
  || fail "T6: expected rc=1, got rc=$RC"

[[ "$(cat "$SANDBOX/repo/.next/marker")" == "live-older" ]] \
  && pass "T6: --rollback swapped .next.old back in" \
  || fail "T6: --rollback did not swap .next.old"

grep -q "npm run build" "$CMDLOG" \
  && fail "T6: --rollback rebuilt despite .old artifacts present" \
  || pass "T6: --rollback needed no rebuild"

grep -q "git reset --hard rollbacktarget444444444444444444444444444" "$CMDLOG" \
  && pass "T6: --rollback reset live repo to backed-up SHA" \
  || fail "T6: --rollback did not git reset to backup SHA"

# ── Results ──────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} PASS / ${FAIL} FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
