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

# PR feeds PRDIR below — reject anything that isn't a plain PR number (or the
# 'manual' sentinel) BEFORE it touches a path, so "../../../etc" can't escape
# ROOT and write/read outside the intended per-PR directory.
if ! [[ "$PR" =~ ^[0-9]+$ || "$PR" == "manual" ]]; then
  echo "invalid PR, refusing to use in path: $PR" >&2
  exit 1
fi

ROOT="$HOME/orchestrator-state/quantika-demo/post-deploy-checks"
PRDIR="$ROOT/$PR"
OUT="$PRDIR/summary-t60.json"
mkdir -p "$PRDIR"

# Scratch files tracked here so both the EXIT cleanup and a mid-flight TERM
# (systemd unit-replace stops the previous run's unit with SIGTERM) can find
# and remove them — closes the mktemp leak on the kill path.
RAW=""
TMPOUT=""
# shellcheck disable=SC2317  # invoked indirectly via trap
cleanup() { rm -f "$RAW" "$TMPOUT"; }
trap cleanup EXIT

# A newer deploy scheduling its own t60 window replaces this unit (systemctl
# stop) while this run may still be in flight. Without this trap the plain
# `>` writes below leave summary-t60.json silently stale (or absent) with no
# marker distinguishing "killed mid-flight" from a real result. Write the
# marker atomically (temp file + mv) so a reader never observes a half-written
# file either.
# shellcheck disable=SC2317  # invoked indirectly via trap
on_term() {
  TMPOUT="$(mktemp)"
  jq -n --arg pr "$PR" --arg sched "$SHA" \
    '{pr:$pr, bake_window:"t60", overall:"FAIL", superseded:false,
      scheduled_sha:$sched, killed:true,
      reason:"killed mid-flight (unit replaced by a newer deploy)"}' > "$TMPOUT"
  mv -f "$TMPOUT" "$OUT"
  exit 143
}
trap on_term TERM

CURRENT="$(cat "$ROOT/.deployed-sha" 2>/dev/null || echo '')"

# Superseded: prod has moved to a newer deploy since this bake window was scheduled.
if [ -n "$CURRENT" ] && [ "$SHA" != "$CURRENT" ]; then
  TMPOUT="$(mktemp)"
  jq -n --arg pr "$PR" --arg sched "$SHA" --arg cur "$CURRENT" --arg base "$BASE" \
    '{pr:$pr, base_url:$base, bake_window:"t60", overall:"superseded",
      superseded:true, scheduled_sha:$sched, current_sha:$cur,
      reason:"newer deploy landed before t60 fired"}' > "$TMPOUT"
  mv -f "$TMPOUT" "$OUT"
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
# Backgrounded + `wait`ed (rather than run in the foreground) so a TERM
# delivered to this script is handled by the trap immediately instead of
# being deferred until the child exits — bash only runs a pending trap
# right away while blocked in the `wait` builtin, not while blocked waiting
# on a synchronous foreground command.
SMOKE_PR="$PR" SMOKE_BASE_URL="$BASE" SMOKE_OUTDIR="$T60OUT" \
  node smoke.mjs > "$RAW" 2> "$PRDIR/t60-stderr.log" &
NODEPID=$!
wait "$NODEPID"
RC=$?

# Augment the captured summary with bake-window metadata, write next to summary.json.
TMPOUT="$(mktemp)"
if jq empty "$RAW" 2>/dev/null; then
  jq --arg sched "$SHA" \
     '. + {bake_window:"t60", superseded:false, scheduled_sha:$sched}' "$RAW" > "$TMPOUT"
else
  jq -n --arg pr "$PR" --arg sched "$SHA" \
    '{pr:$pr, bake_window:"t60", overall:"FAIL", superseded:false,
      scheduled_sha:$sched, reason:"smoke.mjs produced no valid JSON"}' > "$TMPOUT"
  RC=1
fi
mv -f "$TMPOUT" "$OUT"

echo "=== t60 SMOKE · PR #$PR · $BASE ==="
jq -r '"overall=" + .overall + "  scheduled_sha=" + .scheduled_sha' "$OUT" 2>/dev/null || cat "$OUT"
exit $RC
