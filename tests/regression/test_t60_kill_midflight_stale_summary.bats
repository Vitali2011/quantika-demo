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
# FIXED 2026-07-02: run-t60.sh now backgrounds the smoke.mjs call + `wait`s on
# it (so a TERM trap fires immediately instead of being deferred until the
# child exits), and the TERM trap writes a "killed:true" marker atomically
# (temp file + mv) before exiting. This test now asserts that fixed behavior.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"
  export ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$ROOT/77"
  mkdir -p "$TMP/bin"
  # Point run-t60.sh's own mktemp calls at a directory we can inspect after
  # the kill, so the leftover-scratch-file assertion below is meaningful.
  export TMPDIR="$TMP/scratch"
  mkdir -p "$TMPDIR"
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

@test "FIXED: SIGTERM mid-flight (simulating unit-replace) writes an atomic killed marker, no stale summary" {
  echo "OLDSHA" > "$ROOT/.deployed-sha"
  echo '{"pr":"77","overall":"PASS","bake_window":"t60","stale":"from-previous-cycle"}' > "$ROOT/77/summary-t60.json"

  bash "$SCRIPT" 77 OLDSHA >"$TMP/run.log" 2>&1 &
  RUNPID=$!
  sleep 1
  # Simulate systemd's KillMode=control-group stop of the running unit.
  kill -TERM "$RUNPID" 2>/dev/null || true
  wait "$RUNPID" 2>/dev/null || true

  # Fixed: stale content is replaced with a killed marker, not left untouched.
  run cat "$ROOT/77/summary-t60.json"
  [ "$output" != '{"pr":"77","overall":"PASS","bake_window":"t60","stale":"from-previous-cycle"}' ]
  run jq -r '.killed' "$ROOT/77/summary-t60.json"
  [ "$output" = "true" ]
  run grep -l "killed" "$ROOT/77/summary-t60.json"
  [ "$status" -eq 0 ]
  # No leftover mktemp scratch files from the run-t60.sh invocation.
  run bash -c 'ls "$TMPDIR"'
  [ -z "$output" ]
}
