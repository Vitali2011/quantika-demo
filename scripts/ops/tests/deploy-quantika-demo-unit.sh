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
#   T7: mv of build .next into live FAILS mid-flip — previous artifacts are
#       restored and the service restarted (review FINDING-001: must not exit
#       leaving live dir without .next).
#   T8: same for the node_modules mv (second swap step) — full inverse restore.
#   T9: --rollback refuses .old artifacts from a stale generation
#       (.rollback-sha mismatch) and falls back to rebuild (FINDING-002).
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
export TEST_PREV_SHA="1111111111111111111111111111111111111111"
export TEST_REQUEST_SHA="2222222222222222222222222222222222222222"
export TEST_MAIN_SHA="3333333333333333333333333333333333333333"
export TEST_ROLLBACK_SHA="4444444444444444444444444444444444444444"

# git mock: records calls, simulates rev-parse/fetch/clone/reset/show
cat > "$MOCKBIN/git" <<'EOF'
#!/bin/bash
echo "git $*" >> "$CMDLOG"
# strip -C <dir> prefix for matching, remember the dir
DIR=""
if [ "$1" = "-C" ]; then DIR="$2"; shift 2; fi
case "$1" in
  rev-parse)
    case "$*" in
      *origin/main*) echo "$TEST_MAIN_SHA" ;;
      *"$TEST_REQUEST_SHA"*) echo "$TEST_REQUEST_SHA" ;;
      *HEAD*) cat "$MOCK_STATE/current_head" ;;
      *) echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ;;
    esac ;;
  merge-base)
    if [ "$2" = "--is-ancestor" ] \
      && [ "$3" = "$TEST_REQUEST_SHA" ] \
      && [ "$4" = "$TEST_PREV_SHA" ]; then
      exit 1
    fi
    exit 0 ;;
  fetch) exit 0 ;;
  remote) echo "git@example.com:fake/repo.git" ;;
  clone) mkdir -p "$3/.git"; exit 0 ;;
  reset) printf '%s\n' "${*: -1}" > "$MOCK_STATE/current_head"; exit 0 ;;
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
# mv passthrough with injectable failures for the two flip steps
cat > "$MOCKBIN/mv" <<'EOF'
#!/bin/bash
if [ "${FAIL_MV_BUILD_NEXT:-0}" = "1" ]; then
  case "$*" in *"/build/.next "*) echo "mv: injected .next failure" >&2; exit 1 ;; esac
fi
if [ "${FAIL_MV_BUILD_NM:-0}" = "1" ]; then
  case "$*" in *"/build/node_modules "*) echo "mv: injected node_modules failure" >&2; exit 1 ;; esac
fi
exec /bin/mv "$@"
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
    if [ -n "${EXPECT_HEALTH_SHA:-}" ] \
      && [ "$(cat "$QD_REPO_DIR/.deploy-sha" 2>/dev/null)" != "$EXPECT_HEALTH_SHA" ]; then
      exit 23
    fi
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
  echo "$TEST_PREV_SHA" > "$MOCK_STATE/current_head"
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
      bash "$SCRIPT" "${DEPLOY_ARG:-$TEST_REQUEST_SHA}" > "$OUT" 2>&1
  RC=$?
}

lineno() { grep -n "$1" "$CMDLOG" | head -1 | cut -d: -f1; }

# ── T1: happy path ───────────────────────────────────────────────────────────

setup_dirs
DEPLOY_ARG="$TEST_REQUEST_SHA" run_deploy

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

[[ "$(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo" 2>/dev/null)" == "$TEST_REQUEST_SHA" ]] \
  && pass "T1: deployed SHA recorded" \
  || fail "T1: SHA file wrong: $(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo" 2>/dev/null)"

[[ "$(cat "$SANDBOX/repo/.deploy-sha" 2>/dev/null)" == "$TEST_REQUEST_SHA" ]] \
  && pass "T1: public-health runtime SHA marker recorded" \
  || fail "T1: runtime SHA marker missing or wrong"

[[ "$(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak" 2>/dev/null)" == "$TEST_PREV_SHA" ]] \
  && pass "T1: previous SHA backed up" \
  || fail "T1: SHA backup wrong"

grep -q 'curl.*localhost:3000/$' "$CMDLOG" \
  && pass "T1: / smoke-checked after restart" \
  || fail "T1: no smoke curl of / found"

[[ "$(cat "$SANDBOX/repo/.next.old/.rollback-sha" 2>/dev/null)" == "$TEST_PREV_SHA" ]] \
  && pass "T1: .old generation stamped with PREV_SHA (.rollback-sha)" \
  || fail "T1: .rollback-sha marker missing or wrong"

grep -q "git reset --hard $TEST_REQUEST_SHA" "$CMDLOG" \
  && pass "T1: deploy pins the requested SHA even when origin/main advanced" \
  || fail "T1: deploy substituted origin/main for the requested SHA"

grep -qx "DEPLOY_RECEIPT_SHA=$TEST_REQUEST_SHA" "$SANDBOX/out.txt" \
  && pass "T1: exact deployed SHA receipt marker emitted once" \
  || fail "T1: missing or malformed deployed SHA receipt marker"

# ── T1b: exact idempotence rechecks health/smoke without rebuilding ─────────

setup_dirs
echo "$TEST_REQUEST_SHA" > "$MOCK_STATE/current_head"
echo "$TEST_ROLLBACK_SHA" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
run_deploy

[[ $RC -eq 0 ]] && ! grep -q "npm " "$CMDLOG" \
  && grep -q "curl.*localhost:3000/api/health" "$CMDLOG" \
  && grep -q 'curl.*localhost:3000/$' "$CMDLOG" \
  && grep -qx "DEPLOY_RECEIPT_SHA=$TEST_REQUEST_SHA" "$SANDBOX/out.txt" \
  && pass "T1b: exact duplicate is health/smoke checked and receipted" \
  || fail "T1b: exact duplicate did not follow idempotent receipt path"

[[ "$(cat "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak" 2>/dev/null)" == "$TEST_ROLLBACK_SHA" ]] \
  && pass "T1b: exact duplicate preserves the rollback backup" \
  || fail "T1b: exact duplicate overwrote the rollback backup"

# ── T1c: non-canonical SHA input is rejected before mutation ────────────────

setup_dirs
DEPLOY_ARG="A${TEST_REQUEST_SHA:1}" run_deploy
if [[ $RC -ne 0 ]] && ! grep -qE "git (fetch|reset)|npm |systemctl" "$CMDLOG" \
  && ! grep -q "DEPLOY_RECEIPT_SHA=" "$SANDBOX/out.txt"; then
  pass "T1c: uppercase SHA rejected without mutation or receipt"
else
  fail "T1c: uppercase SHA was accepted or mutated state"
fi
unset DEPLOY_ARG

# ── T1d: marker changes only after the new runtime is healthy ───────────────

setup_dirs
echo "$TEST_PREV_SHA" > "$SANDBOX/repo/.deploy-sha"
run_deploy EXPECT_HEALTH_SHA="$TEST_PREV_SHA"
[[ $RC -eq 0 && "$(cat "$SANDBOX/repo/.deploy-sha")" == "$TEST_REQUEST_SHA" ]] \
  && pass "T1d: runtime marker changes only after successful health/smoke" \
  || fail "T1d: runtime marker changed before cutover health succeeded"

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

[[ "$(cat "$SANDBOX/repo/.deploy-sha" 2>/dev/null)" == "$TEST_PREV_SHA" ]] \
  && pass "T4: failed deploy restores previous runtime SHA marker" \
  || fail "T4: runtime SHA marker does not match rolled-back code"

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
echo "$TEST_ROLLBACK_SHA" > "$SANDBOX/repo/.next.old/.rollback-sha"
echo "$TEST_ROLLBACK_SHA" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
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

grep -q "git reset --hard $TEST_ROLLBACK_SHA" "$CMDLOG" \
  && pass "T6: --rollback reset live repo to backed-up SHA" \
  || fail "T6: --rollback did not git reset to backup SHA"

[[ "$(cat "$SANDBOX/repo/.deploy-sha" 2>/dev/null)" == "$TEST_ROLLBACK_SHA" ]] \
  && pass "T6: manual rollback updates runtime SHA marker" \
  || fail "T6: manual rollback left stale runtime SHA marker"

# ── T6b: failed slow rollback keeps the currently served SHA marker ─────────

setup_dirs
echo "$TEST_PREV_SHA" > "$SANDBOX/repo/.deploy-sha"
echo "$TEST_ROLLBACK_SHA" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
DEPLOY_ARG="--rollback" run_deploy FAIL_BUILD=1
[[ $RC -ne 0 && "$(cat "$SANDBOX/repo/.deploy-sha")" == "$TEST_PREV_SHA" ]] \
  && pass "T6b: failed rollback leaves the served runtime SHA marker unchanged" \
  || fail "T6b: failed rollback published a SHA that never became healthy"
unset DEPLOY_ARG

# ── T7: mv of build .next fails mid-flip → restore + restart, never bare exit ─

setup_dirs
run_deploy FAIL_MV_BUILD_NEXT=1

[[ $RC -eq 1 ]] \
  && pass "T7: mid-flip .next mv failure exits 1 after restore" \
  || fail "T7: expected rc=1, got rc=$RC"

[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "live-old" ]] \
  && pass "T7: previous .next restored after failed flip" \
  || fail "T7: live dir left without working .next (marker=$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null))"

grep -q "systemctl restart" "$CMDLOG" \
  && pass "T7: service restarted after restore" \
  || fail "T7: no restart after failed flip — server left on yanked files"

grep -q "FLIP FAILED" "$SANDBOX/out.txt" \
  && pass "T7: flip failure reported loudly" \
  || fail "T7: no FLIP FAILED message in output"

# ── T8: node_modules mv fails (second swap step) → full inverse restore ──────

setup_dirs
run_deploy FAIL_MV_BUILD_NM=1

[[ $RC -eq 1 ]] \
  && pass "T8: mid-flip node_modules mv failure exits 1 after restore" \
  || fail "T8: expected rc=1, got rc=$RC"

[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "live-old" ]] \
  && pass "T8: .next rolled back too (no new-.next/old-node_modules mismatch)" \
  || fail "T8: .next left at new build while node_modules is old (marker=$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null))"

[[ "$(cat "$SANDBOX/repo/node_modules/marker" 2>/dev/null)" == "nm-old" ]] \
  && pass "T8: node_modules restored" \
  || fail "T8: node_modules wrong after failed flip"

grep -q "systemctl restart" "$CMDLOG" \
  && pass "T8: service restarted after restore" \
  || fail "T8: no restart after failed flip"

# ── T9: --rollback with stale-generation .old → rebuild, not blind swap ──────

setup_dirs
mkdir -p "$SANDBOX/repo/.next.old" "$SANDBOX/repo/node_modules.old"
echo "live-older" > "$SANDBOX/repo/.next.old/marker"
echo "nm-older" > "$SANDBOX/repo/node_modules.old/marker"
echo "DIFFERENT-generation-sha-555555555555555" > "$SANDBOX/repo/.next.old/.rollback-sha"
echo "$TEST_ROLLBACK_SHA" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
DEPLOY_ARG="--rollback" run_deploy

grep -q "npm run build" "$CMDLOG" \
  && pass "T9: stale .old generation → rebuild path taken" \
  || fail "T9: stale .old swapped in blindly (no rebuild in CMDLOG)"

[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" != "live-older" ]] \
  && pass "T9: stale .next.old NOT swapped in" \
  || fail "T9: stale-generation .next.old ended up live"

# ── Results ──────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} PASS / ${FAIL} FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
