#!/usr/bin/env bash
# run-t60.sh — t60 bake-window re-run for quantika-demo post-deploy smoke.
# Runs on dev-vps, fired by a systemd transient timer 60 min after a PASS immediate smoke.
# Usage:  run-t60.sh <pr#> <scheduled-sha> [base-url]
# Output: ~/orchestrator-state/quantika-demo/post-deploy-checks/<pr#>/summary-t60.json
# Verdict (overall): PASS | FAIL | superseded
#   superseded = a newer deploy overwrote .deployed-sha before this bake window fired.

set -o pipefail
PR="${1:?Usage: run-t60.sh <pr#> <scheduled-sha> [base-url]}"
SHA="${2:?scheduled SHA required}"
BASE="${3:-https://demo.quantika.org}"

ROOT="$HOME/orchestrator-state/quantika-demo/post-deploy-checks"
PRDIR="$ROOT/$PR"
OUT="$PRDIR/summary-t60.json"
mkdir -p "$PRDIR"

CURRENT="$(cat "$ROOT/.deployed-sha" 2>/dev/null || echo '')"

# Superseded: prod has moved to a newer deploy since this bake window was scheduled.
if [ -n "$CURRENT" ] && [ "$SHA" != "$CURRENT" ]; then
  jq -n --arg pr "$PR" --arg sched "$SHA" --arg cur "$CURRENT" --arg base "$BASE" \
    '{pr:$pr, base_url:$base, bake_window:"t60", overall:"superseded",
      superseded:true, scheduled_sha:$sched, current_sha:$cur,
      reason:"newer deploy landed before t60 fired"}' > "$OUT"
  echo "=== t60 SUPERSEDED · PR #$PR · scheduled=$SHA current=$CURRENT ==="
  exit 0
fi

# Not superseded → reuse smoke.mjs unchanged. Its stdout is the JSON summary; point
# SMOKE_OUTDIR at a t60/ subdir so its own summary.json + screenshots don't clobber
# the immediate run's summary.json.
cd /root/post-deploy-smoke || exit 1
T60OUT="$PRDIR/t60"
mkdir -p "$T60OUT"
RAW="$(mktemp)"
SMOKE_PR="$PR" SMOKE_BASE_URL="$BASE" SMOKE_OUTDIR="$T60OUT" \
  node smoke.mjs > "$RAW" 2> "$PRDIR/t60-stderr.log"
RC=$?

# Augment the captured summary with bake-window metadata, write next to summary.json.
if jq empty "$RAW" 2>/dev/null; then
  jq --arg sched "$SHA" \
     '. + {bake_window:"t60", superseded:false, scheduled_sha:$sched}' "$RAW" > "$OUT"
else
  jq -n --arg pr "$PR" --arg sched "$SHA" \
    '{pr:$pr, bake_window:"t60", overall:"FAIL", superseded:false,
      scheduled_sha:$sched, reason:"smoke.mjs produced no valid JSON"}' > "$OUT"
  RC=1
fi
rm -f "$RAW"

echo "=== t60 SMOKE · PR #$PR · $BASE ==="
jq -r '"overall=" + .overall + "  scheduled_sha=" + .scheduled_sha' "$OUT" 2>/dev/null || cat "$OUT"
exit $RC
