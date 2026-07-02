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
# FIXED 2026-07-02: run-t60.sh now validates PR against ^[0-9]+$|manual before
# ever building PRDIR, and exits non-zero without touching the filesystem at
# all when it doesn't match. This test now asserts that fixed behavior.

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

@test "FIXED: unsanitized PR arg in run-t60.sh is rejected, no path traversal" {
  echo "SHA1" > "$ROOT/.deployed-sha"
  PR="../../../../../../../../tmp/coldqa-traversal-proof-$$"
  run bash "$SCRIPT" "$PR" SHA1
  # Fixed: script rejects the non-numeric PR before touching any path.
  [ "$status" -ne 0 ]
  [ ! -f "$ESCAPE_TARGET/summary-t60.json" ]
  [ ! -d "$ESCAPE_TARGET" ]
}
