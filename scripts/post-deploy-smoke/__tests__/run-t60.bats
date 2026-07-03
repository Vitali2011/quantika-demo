#!/usr/bin/env bats
# Behavioral tests for run-t60.sh. `node` is stubbed on PATH so no prod call is made.

setup() {
  export TMP="$(mktemp -d)"
  export HOME="$TMP"                       # run-t60.sh derives PRDIR from $HOME
  export ROOT="$TMP/orchestrator-state/quantika-demo/post-deploy-checks"
  mkdir -p "$ROOT/42"
  # Stub `node` so a non-superseded run does NOT hit the network.
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
# emit a minimal smoke.mjs-shaped summary on stdout, exit 0 (PASS)
echo '{"pr":"42","overall":"PASS","routes_checked":5,"routes_passed":5,"routes_failed":0,"health":{"healthy":true}}'
exit 0
EOF
  chmod +x "$TMP/bin/node"
  export PATH="$TMP/bin:$PATH"
  export SCRIPT="${BATS_TEST_DIRNAME}/../run-t60.sh"
}

teardown() { rm -rf "$TMP"; }

@test "superseded when current .deployed-sha differs from scheduled sha" {
  echo "NEWSHA999" > "$ROOT/.deployed-sha"          # prod moved on
  run bash "$SCRIPT" 42 OLDSHA111
  [ "$status" -eq 0 ]
  run jq -r .overall "$ROOT/42/summary-t60.json"
  [ "$output" = "superseded" ]
  run jq -r .scheduled_sha "$ROOT/42/summary-t60.json"
  [ "$output" = "OLDSHA111" ]
}

@test "reuses smoke.mjs and augments summary-t60.json when not superseded" {
  echo "SAMESHA" > "$ROOT/.deployed-sha"
  # /root/post-deploy-smoke is where run-t60 cd's to run node; the stub `node`
  # ignores its args so the missing smoke.mjs there is irrelevant to the stub.
  mkdir -p /root/post-deploy-smoke 2>/dev/null || true
  run bash "$SCRIPT" 42 SAMESHA
  [ "$status" -eq 0 ]
  run jq -r .overall "$ROOT/42/summary-t60.json"
  [ "$output" = "PASS" ]
  run jq -r '.bake_window' "$ROOT/42/summary-t60.json"
  [ "$output" = "t60" ]
  run jq -r '.superseded' "$ROOT/42/summary-t60.json"
  [ "$output" = "false" ]
}
