#!/usr/bin/env bash
# Adversarial QA tests for ops/scripts/deploy-quantika-demo.sh (PR #940, test-skill run).
#
# Complements deploy-quantika-demo-unit.sh (T1-T6). Attacks the paths the unit
# suite does NOT cover:
#   A1: flip partial-failure states (mv fault injection mid-swap)
#   A2: rollback paths — exit 2, --rollback rebuild fallback, missing backup,
#       backup-clobber artifact/SHA coherence
#   A3: self-update / re-exec semantics (unit suite sets QD_SKIP_SELF_UPDATE=1
#       everywhere — zero coverage)
#   A5: lock contention fail-fast
#   A6: deploy.yml functional surface unchanged vs main (env-parity)
#
# Assertions encode the script's OWN documented contract (header exit codes +
# PR #940 invariants). A FAIL here = behavior contradicts the documented
# contract on HEAD; see .test-review/findings.md for classification.
#
# Run: bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh
# All external commands (git/npm/npx/systemctl/curl/flock/sleep/mv) are
# PATH-mocked; mv passes through to /bin/mv except injected faults.
# Self-update tests run a SANDBOX COPY of the script (self-update rewrites $0;
# the repo file is never touched).

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/ops/scripts/deploy-quantika-demo.sh"

PASS=0; FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL+1)); }

[[ -f "$SCRIPT" ]] || { echo "FATAL: $SCRIPT not found"; exit 1; }

# ── Sandbox setup ────────────────────────────────────────────────────────────

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
MOCKBIN="$SANDBOX/bin"
mkdir -p "$MOCKBIN"

export CMDLOG="$SANDBOX/cmd.log"
export MOCK_STATE="$SANDBOX/state"
PRISTINE="$SANDBOX/pristine.sh"
cp "$SCRIPT" "$PRISTINE"

# git mock: rev-parse/fetch/clone/reset; `show` behavior switchable for
# self-update tests via GIT_SHOW_MODE (fail|empty|same|modified).
cat > "$MOCKBIN/git" <<'EOF'
#!/bin/bash
echo "git $*" >> "$CMDLOG"
DIR=""
if [ "$1" = "-C" ]; then DIR="$2"; shift 2; fi
case "$1" in
  rev-parse)
    case "$2" in
      HEAD)        echo "prevsha1111111111111111111111111111111111" ;;
      origin/main) echo "targetsha22222222222222222222222222222222" ;;
      *)           echo "othersha333333333333333333333333333333333" ;;
    esac ;;
  fetch) [ "${GIT_FETCH_FAIL:-0}" = "1" ] && exit 1; exit 0 ;;
  remote) echo "git@example.com:fake/repo.git" ;;
  clone) mkdir -p "$3/.git"; exit 0 ;;
  reset) exit 0 ;;
  show)
    case "${GIT_SHOW_MODE:-fail}" in
      fail)     exit 1 ;;
      empty)    exit 0 ;;
      same)     cat "$PRISTINE_PATH" ;;
      modified) cat "$PRISTINE_PATH"; echo "# adv-marker-self-update" ;;
    esac ;;
  *) exit 0 ;;
esac
EOF

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
  echo "build-id-123" > .next/BUILD_ID
  exit 0
fi
exit 0
EOF

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
[ "${FLOCK_FAIL:-0}" = "1" ] && exit 1
exit 0
EOF
cat > "$MOCKBIN/sleep" <<'EOF'
#!/bin/bash
exit 0
EOF
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

# mv mock: pass-through, with targeted fault injection.
# FAIL_MV_DEST=<abs path>  — fail any mv whose LAST arg == this path
# FAIL_MV_SRC_PREFIX=<pfx> — only when the source (first non-flag arg) starts with pfx
cat > "$MOCKBIN/mv" <<'EOF'
#!/bin/bash
echo "mv $*" >> "$CMDLOG"
if [ -n "${FAIL_MV_DEST:-}" ]; then
  for last; do :; done
  src=""
  for a in "$@"; do case "$a" in -*) ;; *) src="$a"; break ;; esac; done
  if [ "$last" = "$FAIL_MV_DEST" ]; then
    if [ -z "${FAIL_MV_SRC_PREFIX:-}" ] || [[ "$src" == "${FAIL_MV_SRC_PREFIX}"* ]]; then
      echo "mv: injected failure: $src -> $last" >&2
      exit 1
    fi
  fi
fi
exec /bin/mv "$@"
EOF
chmod +x "$MOCKBIN"/*

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

# run_script <script-path> <arg> [ENV=VAL ...]
run_script() {
  local target="$1" arg="$2"; shift 2
  OUT="$SANDBOX/out.txt"
  env PATH="$MOCKBIN:$PATH" \
      HOME="$SANDBOX/home" \
      QD_REPO_DIR="$SANDBOX/repo" \
      QD_BUILD_DIR="$SANDBOX/build" \
      QD_LOCK_FILE="$SANDBOX/lock" \
      CMDLOG="$CMDLOG" MOCK_STATE="$MOCK_STATE" \
      PRISTINE_PATH="$PRISTINE" \
      "$@" \
      bash "$target" "$arg" > "$OUT" 2>&1
  RC=$?
}

# Non-self-update runs use the repo script directly with QD_SKIP_SELF_UPDATE=1
run_deploy() { # <arg> [ENV=VAL...]
  local arg="$1"; shift
  run_script "$SCRIPT" "$arg" QD_SKIP_SELF_UPDATE=1 "$@"
}

# ═════ A1: flip partial-failure states ═══════════════════════════════════════

# A1a: mv BUILD/.next -> live/.next fails mid-flip.
# Contract (header): exit 1 = "deploy failed but rollback restored prod".
# So after a mid-flip failure either live .next must be restored, or the exit
# code must be 2 (manual intervention). Neither -> contract violation.
setup_dirs
run_deploy somesha FAIL_MV_DEST="$SANDBOX/repo/.next" FAIL_MV_SRC_PREFIX="$SANDBOX/build/"

if [[ -d "$SANDBOX/repo/.next" ]]; then
  pass "A1a: live .next present after mid-flip mv failure (restored)"
elif [[ $RC -eq 2 ]]; then
  pass "A1a: live .next gone but exit=2 signals manual intervention"
else
  fail "A1a: mid-flip mv failure leaves live dir with NO .next, no restore attempted, exit=$RC (contract: 1 = 'rollback restored prod')"
fi
# Restart is FORBIDDEN only while the live dir is half-swapped; after a full
# restore (live .next back to the previous generation) a restart is the clean
# recovery — flip_failed restores first, then restarts (FINDING-001 fix).
if [[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "live-old" ]]; then
  pass "A1a: live dir fully restored before any restart (restart allowed/expected here)"
elif grep -q "systemctl restart" "$CMDLOG"; then
  fail "A1a: restart attempted on half-swapped state"
else
  pass "A1a: no restart on half-swapped state (server keeps old FDs)"
fi

# A1b: .next swap OK, node_modules swap fails.
setup_dirs
run_deploy somesha FAIL_MV_DEST="$SANDBOX/repo/node_modules" FAIL_MV_SRC_PREFIX="$SANDBOX/build/"

if [[ -d "$SANDBOX/repo/node_modules" ]]; then
  pass "A1b: live node_modules present after mid-flip mv failure (restored)"
elif [[ $RC -eq 2 ]]; then
  pass "A1b: node_modules gone but exit=2 signals manual intervention"
else
  fail "A1b: node_modules swap failure leaves live dir with NO node_modules AND new .next, exit=$RC, no restore"
fi

# A1c: first deploy — live dir has no .next/node_modules at all.
setup_dirs
rm -rf "$SANDBOX/repo/.next" "$SANDBOX/repo/node_modules"
run_deploy somesha

[[ $RC -eq 0 ]] \
  && pass "A1c: first-deploy (no prior artifacts) exits 0" \
  || { fail "A1c: first-deploy rc=$RC"; tail -5 "$OUT" | sed 's/^/  | /'; }
[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "from-build" ]] \
  && pass "A1c: fresh build swapped in on first deploy" \
  || fail "A1c: .next not swapped on first deploy"

# ═════ A2: rollback paths ════════════════════════════════════════════════════

# A2a: health fails after flip AND after swap-back -> exit 2 (INV-7).
setup_dirs
run_deploy somesha HEALTH_FAIL_FIRST_N=99

[[ $RC -eq 2 ]] \
  && pass "A2a: rollback-also-failed exits 2 per contract" \
  || fail "A2a: expected rc=2, got rc=$RC"
grep -q "MANUAL INTERVENTION" "$OUT" \
  && pass "A2a: MANUAL INTERVENTION called out" \
  || fail "A2a: no MANUAL INTERVENTION message"
[[ "$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)" == "live-old" ]] \
  && pass "A2a: old artifacts were swapped back before the second health fail" \
  || fail "A2a: swap-back did not restore old .next"

# A2b: --rollback with NO .old artifacts -> rebuild fallback path.
setup_dirs
echo "rollbacktarget444444444444444444444444444" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
run_deploy --rollback

[[ $RC -eq 1 ]] \
  && pass "A2b: --rollback rebuild path exits 1 (success contract)" \
  || fail "A2b: expected rc=1, got rc=$RC"
grep -q "npm run build pwd=$SANDBOX/repo" "$CMDLOG" \
  && pass "A2b: rebuild fallback builds in live dir" \
  || fail "A2b: no rebuild despite missing .old artifacts"
grep -q "git reset --hard rollbacktarget444444444444444444444444444" "$CMDLOG" \
  && pass "A2b: rebuild fallback resets to backed-up SHA" \
  || fail "A2b: no git reset to backup SHA"
grep -q "systemctl restart" "$CMDLOG" \
  && pass "A2b: service restarted after rebuild" \
  || fail "A2b: no restart after rebuild"

# A2c: --rollback with NO SHA_BACKUP file at all.
setup_dirs
run_deploy --rollback

[[ $RC -ne 0 ]] \
  && pass "A2c: --rollback without backup file fails (rc=$RC)" \
  || fail "A2c: --rollback without backup exited 0"
grep -q "no SHA_BACKUP" "$OUT" \
  && pass "A2c: explicit 'no SHA_BACKUP' message" \
  || fail "A2c: no explicit message about missing backup"
# Contract note (analysis, not assert): rc here is 1 — same code as
# rollback-SUCCESS. Machine consumers cannot distinguish. See findings A4.

# A2d: artifact/SHA coherence — backup clobbered by a failed deploy.
# State a real sequence produces (deploy N ok: live=shaB, .old=gen-A, bak=shaA;
# deploy N+1 build-fails AFTER overwriting bak with shaB): live=gen-B code+
# artifacts, .old=gen-A artifacts, SHA_BACKUP=shaB.
# --rollback then claims "restored shaB" while installing gen-A artifacts.
setup_dirs
echo "gen-B" > "$SANDBOX/repo/.next/marker"
echo "gen-B" > "$SANDBOX/repo/node_modules/marker"
mkdir -p "$SANDBOX/repo/.next.old" "$SANDBOX/repo/node_modules.old"
echo "gen-A" > "$SANDBOX/repo/.next.old/marker"
echo "gen-A" > "$SANDBOX/repo/node_modules.old/marker"
echo "shaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
run_deploy --rollback

REPORTED_OK=$(grep -c "rollback OK" "$OUT" || true)
LIVE_GEN=$(cat "$SANDBOX/repo/.next/marker" 2>/dev/null)
if [[ "$REPORTED_OK" -ge 1 && "$LIVE_GEN" == "gen-A" ]]; then
  fail "A2d: --rollback reports 'rollback OK ... on shaB' while serving gen-A artifacts (artifact generation not validated against SHA_BACKUP)"
else
  pass "A2d: artifact/SHA coherence held (live=$LIVE_GEN)"
fi

# ═════ A3: self-update / re-exec semantics ═══════════════════════════════════

selfupdate_setup() {
  setup_dirs
  INSTALLED="$SANDBOX/installed.sh"
  rm -f "$INSTALLED" "$INSTALLED.new" "$INSTALLED.bak"
  cp "$PRISTINE" "$INSTALLED"
  chmod +x "$INSTALLED"
}

# A3a: origin copy differs -> install + .bak + re-exec ONCE, arg preserved.
selfupdate_setup
run_script "$INSTALLED" somesha GIT_SHOW_MODE=modified

UPDATES=$(grep -c "self-updated from origin/main" "$OUT" || true)
[[ "$UPDATES" -eq 1 ]] \
  && pass "A3a: self-update + re-exec happened exactly once (no loop)" \
  || fail "A3a: expected 1 self-update line, got $UPDATES (rc=$RC)"
grep -q "adv-marker-self-update" "$INSTALLED" \
  && pass "A3a: new content installed into \$0" \
  || fail "A3a: installed copy not updated"
[[ -f "$INSTALLED.bak" ]] && ! grep -q "adv-marker-self-update" "$INSTALLED.bak" \
  && pass "A3a: previous version kept as .bak" \
  || fail "A3a: .bak missing or contains new content"
[[ $RC -eq 0 ]] \
  && pass "A3a: deploy proceeded to success after re-exec (arg preserved)" \
  || fail "A3a: rc=$RC after re-exec"
grep -q "deploy SHA=somesha" "$OUT" \
  && pass "A3a: <sha> arg survived re-exec" \
  || fail "A3a: sha arg lost in re-exec"
[[ ! -f "$INSTALLED.new" ]] \
  && pass "A3a: no .new temp left behind" \
  || fail "A3a: .new temp file left behind"

# A3a-rb: --rollback arg survives re-exec.
selfupdate_setup
mkdir -p "$SANDBOX/repo/.next.old" "$SANDBOX/repo/node_modules.old"
echo "gen-A" > "$SANDBOX/repo/.next.old/marker"
echo "gen-A" > "$SANDBOX/repo/node_modules.old/marker"
echo "rollbacktarget444444444444444444444444444" > "$SANDBOX/home/.last-deployed-sha-quantika-demo.bak"
run_script "$INSTALLED" --rollback GIT_SHOW_MODE=modified

grep -q "ROLLBACK to rollbacktarget" "$OUT" \
  && pass "A3a-rb: --rollback arg survived re-exec" \
  || fail "A3a-rb: --rollback arg lost after self-update (rc=$RC)"
[[ $RC -eq 1 ]] \
  && pass "A3a-rb: rollback-success contract exit 1 after re-exec" \
  || fail "A3a-rb: rc=$RC"

# A3b: fetch fails (offline) -> run as-is.
selfupdate_setup
run_script "$INSTALLED" somesha GIT_FETCH_FAIL=1

grep -q "self-updated" "$OUT" \
  && fail "A3b: self-updated despite fetch failure" \
  || pass "A3b: offline -> ran as-is"
# Fully offline the DEPLOY itself must fail loudly at the pinning fetch
# (line 143 `git fetch origin main || fail`) — prod untouched.
# (test-skill note: first version of this check asserted rc=0 — that was a
# TEST-BUG; the script is right to refuse deploying without a fresh fetch.)
[[ $RC -eq 1 ]] && grep -q "git fetch failed" "$OUT" \
  && pass "A3b: offline deploy refused at pinning fetch (rc=1, prod untouched)" \
  || fail "A3b: expected loud fetch refusal, rc=$RC"
[[ ! -f "$INSTALLED.new" ]] \
  && pass "A3b: no .new left after failed fetch" \
  || fail "A3b: stale .new left behind"

# A3c: git show fails (canonical path not on origin/main yet — pre-merge window).
selfupdate_setup
run_script "$INSTALLED" somesha GIT_SHOW_MODE=fail

grep -q "self-updated" "$OUT" \
  && fail "A3c: self-updated despite git-show failure" \
  || pass "A3c: pre-merge window (show fails) -> ran as-is"
[[ ! -f "$INSTALLED.new" ]] \
  && pass "A3c: .new cleaned up after failed show" \
  || fail "A3c: stale .new left behind"

# A3d: git show succeeds but emits EMPTY file -> -s guard refuses install.
selfupdate_setup
run_script "$INSTALLED" somesha GIT_SHOW_MODE=empty

grep -q "self-updated" "$OUT" \
  && fail "A3d: installed an EMPTY script" \
  || pass "A3d: empty origin copy rejected (-s guard)"
cmp -s "$INSTALLED" "$PRISTINE" \
  && pass "A3d: installed copy unchanged" \
  || fail "A3d: installed copy was modified"
[[ ! -f "$INSTALLED.new" ]] \
  && pass "A3d: empty .new cleaned up" \
  || fail "A3d: empty .new left behind"

# A3e: identical content -> no update, no .bak churn.
selfupdate_setup
run_script "$INSTALLED" somesha GIT_SHOW_MODE=same

grep -q "self-updated" "$OUT" \
  && fail "A3e: self-updated on identical content" \
  || pass "A3e: identical content -> no re-exec"
[[ ! -f "$INSTALLED.bak" ]] \
  && pass "A3e: no .bak churn on identical content" \
  || fail "A3e: .bak written without update"
[[ ! -f "$INSTALLED.new" ]] \
  && pass "A3e: .new cleaned up on identical content" \
  || fail "A3e: .new left behind"

# A3f: QD_SKIP_SELF_UPDATE=1 honored even when update available.
selfupdate_setup
run_script "$INSTALLED" somesha GIT_SHOW_MODE=modified QD_SKIP_SELF_UPDATE=1

grep -q "self-updated" "$OUT" \
  && fail "A3f: QD_SKIP_SELF_UPDATE=1 ignored" \
  || pass "A3f: QD_SKIP_SELF_UPDATE=1 honored"

# ═════ A5: lock contention ═══════════════════════════════════════════════════

setup_dirs
run_deploy somesha FLOCK_FAIL=1

[[ $RC -ne 0 ]] \
  && pass "A5: locked-out deploy fails fast (rc=$RC)" \
  || fail "A5: locked-out deploy exited 0"
grep -q "another deploy in progress" "$OUT" \
  && pass "A5: explicit lock message" \
  || fail "A5: no lock message"
if grep -qE "git (fetch|reset)|npm |systemctl" "$CMDLOG"; then
  fail "A5: state-mutating commands ran despite lock failure: $(grep -E 'git (fetch|reset)|npm |systemctl' "$CMDLOG" | head -3 | tr '\n' ';')"
else
  pass "A5: no state mutation after lock failure"
fi

# ═════ A6: deploy.yml functional surface vs main ═════════════════════════════

YML_DIFF=$(diff \
  <(git -C "$REPO_ROOT" show main:.github/workflows/deploy.yml | grep -vE '^[[:space:]]*#') \
  <(grep -vE '^[[:space:]]*#' "$REPO_ROOT/.github/workflows/deploy.yml") 2>/dev/null | grep -E '^[<>]' || true)
YML_DIFF_COUNT=$(printf '%s' "$YML_DIFF" | grep -c . || true)
# Allowed functional drift vs main (both intentional in #940):
#   - health-fail hint string (pm2 → systemctl)
#   - timeout-minutes 15 → 30 (FINDING-006: first staged run + rollback-rebuild
#     exceed 15; an SSH cut mid-rollback must not happen)
UNEXPECTED=$(printf '%s' "$YML_DIFF" | grep -vE 'check VPS|timeout-minutes' || true)
if [[ "$YML_DIFF_COUNT" -eq 0 ]]; then
  pass "A6: deploy.yml functionally identical to main"
elif [[ -z "$UNEXPECTED" ]]; then
  pass "A6: deploy.yml functional drift is exactly the allowed set (hint string + timeout 15→30)"
else
  fail "A6: unexpected functional YAML drift: $(printf '%s' "$UNEXPECTED" | head -4 | tr '\n' ';')"
fi

# ── Results ──────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Adversarial results: ${PASS} PASS / ${FAIL} FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
