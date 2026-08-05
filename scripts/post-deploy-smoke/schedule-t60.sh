#!/usr/bin/env bash
# schedule-t60.sh — schedule the t60 bake-window re-run on dev-vps.
# Runs on dev-vps, invoked over SSH by post-deploy-smoke.yml after a PASS immediate smoke.
# Usage:  schedule-t60.sh <pr#> <sha> [base-url]
# Effect: records <sha> as the newest deploy, then (re)schedules a fixed-name transient
#         systemd timer to fire run-t60.sh 60 min from now. Same unit name => new deploy
#         replaces any earlier pending bake window.

set -o pipefail
PR="${1:?Usage: schedule-t60.sh <pr#> <sha> [base-url]}"
SHA="${2:?sha required}"
BASE="${3:-https://demo.quantika.org}"

# PR feeds PRDIR below — reject anything that isn't a plain PR number (or the
# 'manual' sentinel) BEFORE it touches a path, so "../../../etc" can't escape
# ROOT and write/read outside the intended per-PR directory.
if ! [[ "$PR" =~ ^[0-9]+$ || "$PR" == "manual" ]]; then
  echo "invalid PR, refusing to use in path: $PR" >&2
  exit 1
fi

UNIT="quantika-t60-smoke"
ROOT="$HOME/orchestrator-state/quantika-demo/post-deploy-checks"
PRDIR="$ROOT/$PR"
mkdir -p "$PRDIR"

# Record the just-deployed SHA: global marker (superseded source-of-truth) + per-PR copy.
echo "$SHA" > "$ROOT/.deployed-sha"
echo "$SHA" > "$PRDIR/t60-scheduled-sha"

# Replace any pending bake window: stop old timer/service, clear failed state, so the
# fresh systemd-run can claim the fixed unit name. --collect GCs a prior failed unit.
systemctl stop "$UNIT.timer" 2>/dev/null || true
systemctl stop "$UNIT.service" 2>/dev/null || true
systemctl reset-failed "$UNIT.service" 2>/dev/null || true

# Schedule the delayed run. --on-active=60min => fire 60 min from now, on dev-vps,
# runner exits immediately (no Actions minutes burned on the wait).
# systemd-run's transient unit does NOT inherit HOME from this shell (only PATH/USER
# are set by default) — run-t60.sh derives its output dir from $HOME, so without this
# --setenv it silently writes summary-t60.json under "/" instead of "$HOME/...",
# where nothing ever looks for it.
systemd-run \
  --unit="$UNIT" \
  --collect \
  --on-active=60min \
  --setenv="HOME=$HOME" \
  --description="quantika-demo post-deploy t60 bake window (PR #$PR, $SHA)" \
  /root/post-deploy-smoke/run-t60.sh "$PR" "$SHA" "$BASE"

echo "=== t60 SCHEDULED · PR #$PR · sha=$SHA · fires in 60min (unit=$UNIT) ==="
