#!/usr/bin/env bats
# Cold RE-VERIFY (coldqa-1100b) — INDEPENDENT adversarial attacks on the REAL
# run-t60.sh / schedule-t60.sh, NOT a model of the workflow string.
#
# The executor's test_t60_command_injection.sh only reproduces a *copy* of the
# workflow's validate-then-build logic; it never invokes the actual scripts. This
# test fires a full payload battery straight at both shipped scripts and asserts
# their own `^[0-9]+$|manual` guard holds against injection AND path traversal,
# with zero filesystem side effects and zero systemd invocation.
#
# Verified 2026-07-02 against HEAD 205e47d7 (feat/smoke-t60 post-fix): all reject.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"
  mkdir -p "$TMP/bin"
  # Stubs so a HYPOTHETICAL validation bypass can't hang (node) or fire real
  # units (systemctl/systemd-run) — and so we can detect if it ever reached them.
  printf '#!/usr/bin/env bash\necho "{\\"overall\\":\\"PASS\\"}"\n' > "$TMP/bin/node"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/systemctl"
  printf '#!/usr/bin/env bash\necho "FIRED $*" >> "%s/systemd-run.log"\n' "$TMP" > "$TMP/bin/systemd-run"
  chmod +x "$TMP/bin"/*
  export PATH="$TMP/bin:$PATH"
  export RUN="${BATS_TEST_DIRNAME}/../../scripts/post-deploy-smoke/run-t60.sh"
  export SCH="${BATS_TEST_DIRNAME}/../../scripts/post-deploy-smoke/schedule-t60.sh"
  # Unique escape targets on the REAL host fs (parallel-session-safe suffix; see
  # memory feedback_dev_vps_tmp_cross_session_pollution).
  export PROOF="$TMP/PWNED"
  export ESC_ABS="/tmp/coldqa-reverify-abs-$$"
  export ESC_REL="/tmp/coldqa-reverify-rel-$$"
  rm -f "$PROOF"; rm -rf "$ESC_ABS" "$ESC_REL"
}

teardown() { rm -rf "$TMP" "$ESC_ABS" "$ESC_REL" 2>/dev/null; }

# Each malicious PR must be rejected (non-zero) by BOTH scripts with no side effect.
assert_pr_rejected() {
  local pr="$1"
  run bash "$RUN" "$pr" deadbeef
  [ "$status" -ne 0 ]
  run bash "$SCH" "$pr" deadbeef
  [ "$status" -ne 0 ]
  [ ! -f "$PROOF" ]
  [ ! -e "$ESC_ABS" ]
  [ ! -e "$ESC_REL" ]
  [ ! -f "$TMP/systemd-run.log" ]   # scheduler must reject before systemd-run
}

@test "injection: semicolon breakout in PR is rejected" {
  assert_pr_rejected "781; touch $PROOF #"
}

@test "injection: backtick command-substitution in PR is rejected" {
  assert_pr_rejected "781\`touch $PROOF\`"
}

@test "injection: dollar-paren command-substitution in PR is rejected" {
  assert_pr_rejected "781\$(touch $PROOF)"
}

@test "injection: newline-embedded command in PR is rejected (no grep-style \$ bypass)" {
  local nl=$'\n'
  assert_pr_rejected "781${nl}touch $PROOF"
}

@test "injection: 'manual' prefix + payload is rejected (only bare 'manual' allowed)" {
  assert_pr_rejected "manual; touch $PROOF"
}

@test "traversal: relative ../ escape in PR is rejected before any path is built" {
  assert_pr_rejected "../../../../../../../../tmp/coldqa-reverify-rel-$$"
}

@test "traversal: absolute path in PR is rejected" {
  assert_pr_rejected "/tmp/coldqa-reverify-abs-$$"
}

@test "guard: leading/trailing whitespace and non-digits in PR are rejected" {
  assert_pr_rejected " 781"
  assert_pr_rejected "781 "
  assert_pr_rejected "+781"
  assert_pr_rejected "0x1F4"
}

@test "guard: fullwidth unicode digits do NOT satisfy [0-9] (ASCII-only)" {
  assert_pr_rejected "７８１"
}

@test "control: a legitimate numeric PR is ACCEPTED (guard is not over-broad)" {
  local ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$ROOT"
  echo "NEWSHA" > "$ROOT/.deployed-sha"
  # scheduled sha != current -> superseded branch, exits 0, writes summary.
  run bash "$RUN" 781 OLDSHA
  [ "$status" -eq 0 ]
  run jq -r '.overall' "$ROOT/781/summary-t60.json"
  [ "$output" = "superseded" ]
}
