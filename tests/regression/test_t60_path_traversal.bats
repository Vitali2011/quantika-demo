#!/usr/bin/env bats
# Regression test for coldqa-1100 finding: run-t60.sh / schedule-t60.sh build
# PRDIR="$ROOT/$PR" with zero validation on $PR. A PR value containing "../"
# escapes ROOT entirely -> arbitrary-path file write (as root on dev-vps, since
# these scripts run as root@157.173.124.116 per post-deploy-smoke.yml).
#
# CONFIRMED empirically 2026-07-02 during /test-skill run on PR #1100:
#   PR='../../../../../../../../tmp/pwned-by-coldqa'
#   -> summary-t60.json / t60/ / t60-stderr.log written to real /tmp/pwned-by-coldqa/
#      (well outside $ROOT = ~/orchestrator-state/quantika-demo/post-deploy-checks)
#
# Do NOT fix here — this file only proves the bug. See .test-review/findings.md.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"
  export ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$ROOT"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
echo '{"pr":"x","overall":"PASS"}'
exit 0
EOF
  chmod +x "$TMP/bin/node"
  export PATH="$TMP/bin:$PATH"
  export SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/post-deploy-smoke/run-t60.sh"
  # $ROOT is 5 path segments deep (mktemp dir + orchestrator-state/quantika-demo/
  # post-deploy-checks); 8x "../" overshoots past "/" and clamps there, so the
  # traversal lands on the REAL host /tmp, not a path nested under $TMP. Unique
  # suffix avoids collision with other parallel sessions sharing /tmp (see
  # memory: feedback_dev_vps_tmp_cross_session_pollution).
  export ESCAPE_TARGET="/tmp/coldqa-traversal-proof-$$"
}

teardown() {
  rm -rf "$TMP" "$ESCAPE_TARGET" 2>/dev/null
}

@test "BUG: unsanitized PR arg in run-t60.sh escapes ROOT via path traversal" {
  echo "SHA1" > "$ROOT/.deployed-sha"
  PR="../../../../../../../../tmp/coldqa-traversal-proof-$$"
  run bash "$SCRIPT" "$PR" SHA1
  [ "$status" -eq 0 ]
  # BUG: file materializes outside $ROOT. This assertion documents the CURRENT
  # (buggy) behavior — a future fix should make this test fail (file should
  # NOT exist, or the script should reject non-numeric PR and exit non-zero).
  [ -f "$ESCAPE_TARGET/summary-t60.json" ]
}
