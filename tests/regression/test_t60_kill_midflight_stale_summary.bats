#!/usr/bin/env bats
# Regression proof for coldqa-1100 finding: schedule-t60.sh's "replace" logic
# (`systemctl stop $UNIT.service` before re-scheduling) SIGTERMs an
# in-flight run-t60.sh if a new deploy lands while the previous bake window
# is still executing (fired but not yet finished). run-t60.sh has no signal
# trap and writes summary-t60.json via a plain `>` redirect (non-atomic), so a
# kill mid-flight leaves whatever was there before (stale content from an
# earlier cycle, or nothing at all) with NO marker distinguishing it from a
# real result — silent stale/missing data, not surfaced anywhere (this bake
# window's outcome is consumed by a human reading the file later, per the
# PR's own plan doc: "orchestrator-run, not CI").
#
# CONFIRMED empirically 2026-07-02: killing run-t60.sh mid-execution leaves
# summary-t60.json byte-for-byte unchanged (the stale pre-existing content),
# with no "killed"/"superseded"/"stale" flag anywhere in it.
#
# Do NOT fix here — this file only proves the bug. See .test-review/findings.md.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"
  export ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$ROOT/77"
  mkdir -p "$TMP/bin"
  # Simulate a slow smoke.mjs (real one polls /api/health up to 90s + retries).
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
sleep 30
echo '{"pr":"77","overall":"PASS"}'
exit 0
EOF
  chmod +x "$TMP/bin/node"
  export PATH="$TMP/bin:$PATH"
  export SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/post-deploy-smoke/run-t60.sh"
}

teardown() { rm -rf "$TMP"; }

@test "BUG: SIGTERM mid-flight (simulating unit-replace) leaves stale summary-t60.json with no error marker" {
  echo "OLDSHA" > "$ROOT/.deployed-sha"
  echo '{"pr":"77","overall":"PASS","bake_window":"t60","stale":"from-previous-cycle"}' > "$ROOT/77/summary-t60.json"

  bash "$SCRIPT" 77 OLDSHA >"$TMP/run.log" 2>&1 &
  RUNPID=$!
  sleep 1
  # Simulate systemd's KillMode=control-group stop of the running unit.
  kill -TERM "$RUNPID" 2>/dev/null || true
  wait "$RUNPID" 2>/dev/null || true

  # BUG: file is untouched stale content, not an error/superseded marker.
  run cat "$ROOT/77/summary-t60.json"
  [ "$output" = '{"pr":"77","overall":"PASS","bake_window":"t60","stale":"from-previous-cycle"}' ]
  # Nothing in the file (or anywhere else) records that this run was killed.
  run grep -l "killed\|terminated\|superseded" "$ROOT/77/summary-t60.json"
  [ "$status" -ne 0 ]
}
