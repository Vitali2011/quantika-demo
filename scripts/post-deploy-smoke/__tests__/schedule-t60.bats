#!/usr/bin/env bats
# systemctl + systemd-run are stubbed on PATH; we assert on the marker file and on
# the exact systemd-run invocation (captured to a log), not on real timers.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"
  export ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$TMP/bin"
  export CALLS="$TMP/calls.log"
  for c in systemctl systemd-run; do
    cat > "$TMP/bin/$c" <<EOF
#!/usr/bin/env bash
echo "$c \$*" >> "$CALLS"
exit 0
EOF
    chmod +x "$TMP/bin/$c"
  done
  export PATH="$TMP/bin:$PATH"
  export SCRIPT="${BATS_TEST_DIRNAME}/../schedule-t60.sh"
}
teardown() { rm -rf "$TMP"; }

@test "records scheduled sha into PR dir and global .deployed-sha" {
  run bash "$SCRIPT" 42 ABC123
  [ "$status" -eq 0 ]
  [ "$(cat "$ROOT/.deployed-sha")" = "ABC123" ]
  [ "$(cat "$ROOT/42/t60-scheduled-sha")" = "ABC123" ]
}

@test "stops existing timer (replace) before scheduling new one" {
  run bash "$SCRIPT" 42 ABC123
  grep -q "systemctl stop quantika-t60-smoke.timer" "$CALLS"
  grep -q "on-active=60min" "$CALLS"
  grep -q "unit=quantika-t60-smoke" "$CALLS"
  grep -q "run-t60.sh 42 ABC123" "$CALLS"
}
