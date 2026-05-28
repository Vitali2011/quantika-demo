#!/usr/bin/env bash
# run-quantika.sh — Phase 1b proof: headless post-deploy smoke for quantika-demo.
# Usage:  run-quantika.sh <pr#> [base-url]
# Output: ~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/{summary.json, *.png}
# Exit:   0 = PASS (all routes ok) · 1 = FAIL (any route failed)

set -o pipefail
PR="${1:?Usage: run-quantika.sh <pr#> [base-url]}"
BASE="${2:-https://demo.quantika.org}"
OUTDIR="$HOME/orchestrator-state/quantika-demo/post-deploy-checks/$PR"

mkdir -p "$OUTDIR"
cd /root/post-deploy-smoke

SMOKE_PR="$PR" SMOKE_BASE_URL="$BASE" SMOKE_OUTDIR="$OUTDIR" \
  node smoke.mjs > "$OUTDIR/summary.json" 2> "$OUTDIR/stderr.log"
RC=$?

echo "=== POST-DEPLOY SMOKE · PR #$PR · $BASE ==="
if command -v jq >/dev/null; then
  jq -r '"overall=" + .overall + "  passed=" + (.routes_passed|tostring) + "/" + (.routes_checked|tostring) + "  failed=" + (.routes_failed|tostring)' "$OUTDIR/summary.json"
  echo "--- per-route ---"
  jq -r '.results[] | "  " + (if .pass then "✓" else "✗" end) + " " + .route + " (status=" + (.status|tostring) + ", " + (.duration_ms|tostring) + "ms)" + (if .error_markers|length>0 then " markers=" + (.error_markers|join(",")) else "" end) + (if .error then " error=" + .error else "" end)' "$OUTDIR/summary.json"
else
  cat "$OUTDIR/summary.json"
fi
echo "--- artifacts ---"
ls "$OUTDIR/" | head -20
exit $RC
