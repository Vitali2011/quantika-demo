#!/usr/bin/env bash
# run-judge.sh — run judge.sh for all (task x feat) pairs with cred-guard assertion.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS_FILE="$HOME/.claude/.credentials.json"
TASKS=(pr964 pr965 pr970)
FEATS=(caveman rtk cavecrew all)

# Assert credentials file size
assert_creds() {
  local label="$1"
  local sz
  sz="$(wc -c < "$CREDS_FILE")"
  echo "CREDS_CHECK $label: $sz bytes"
  if [ "$sz" -ne 471 ]; then
    echo "ERROR: credentials corrupted ($sz != 471) at $label — STOPPING"
    exit 1
  fi
}

assert_creds "START"

# Dry-run one judge call to verify HOME isolation holds
echo "=== CRED-GUARD: dry-run one judge call ==="
bash "$SCRIPT_DIR/judge.sh" pr964 caveman 2>&1 | tail -3
assert_creds "AFTER_FIRST_CALL"
echo "HOME isolation verified — credentials unchanged."
echo ""

# Run remaining judge calls
for task in "${TASKS[@]}"; do
  for feat in "${FEATS[@]}"; do
    # Skip pr964/caveman — already ran in guard check
    if [ "$task" = "pr964" ] && [ "$feat" = "caveman" ]; then
      echo "[$task/$feat] already ran (cred-guard check), skipping"
      continue
    fi
    echo "[$task/$feat] judging..."
    bash "$SCRIPT_DIR/judge.sh" "$task" "$feat" 2>&1 | tail -2
    echo ""
  done
done

echo "=== ALL JUDGE CALLS DONE ==="
assert_creds "END"
