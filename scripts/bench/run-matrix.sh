#!/usr/bin/env bash
# Throttled benchmark matrix runner. Runs the single-claude arms × REPS, at most
# MAX_PAR concurrently, gated on free RAM. Idempotent: skips runs already done
# (usage.tsv exists) or currently running (worktree dir exists). Safe to start
# while an earlier ad-hoc wave is still in flight — it adopts/respects those.
# Excludes the dynamic-workflow arm (different mechanism — run separately).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-2}"
MIN_AVAIL_MB="${MIN_AVAIL_MB:-2000}"   # hold a launch while available RAM is below this
REPS="${REPS:-3}"
BUDGET="${BUDGET:-8}"

# arm:model:effort  (dynamic-workflow handled separately)
ARMS=(
  "sonnet-max:claude-sonnet-4-6:max"
  "opus-low:claude-opus-4-8:low"
  "opus-med:claude-opus-4-8:medium"
  "opus-high:claude-opus-4-8:high"
  "opus-xhigh:claude-opus-4-8:xhigh"
  "opus-max:claude-opus-4-8:max"
)

avail_mb() { free -m | awk '/^Mem:/{print $7}'; }
# Count ACTIVE arms by live worktree dirs (1:1 with a running solve). pgrep-on-run-arm
# double-counts: each run-arm spawns a subshell sharing the same cmdline, so an arm
# read as 2 and MAX_PAR=2 silently throttled to 1-at-a-time. (Fix 2026-06-13.)
running()  { ls -d "${ROOT}/bench/war-risk/worktrees/"*/ 2>/dev/null | wc -l; }
log()      { echo "[$(date +%H:%M:%S)] $*"; }

log "matrix start: MAX_PAR=$MAX_PAR MIN_AVAIL_MB=$MIN_AVAIL_MB REPS=$REPS"
for rep in $(seq 1 "$REPS"); do
  for spec in "${ARMS[@]}"; do
    IFS=: read -r arm model effort <<< "$spec"
    out="${ROOT}/bench/war-risk/results/${arm}/r${rep}/usage.tsv"
    wt="${ROOT}/bench/war-risk/worktrees/${arm}-r${rep}"
    [ -f "$out" ] && { log "skip ${arm} r${rep} (done)"; continue; }
    [ -d "$wt" ]  && { log "skip ${arm} r${rep} (already running)"; continue; }
    # slot gate
    while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 20; done
    # RAM gate
    while [ "$(avail_mb)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait (avail $(avail_mb)MB < ${MIN_AVAIL_MB})"; sleep 30; done
    log "launch ${arm} r${rep} (avail $(avail_mb)MB, running $(running))"
    # setsid → each arm in its OWN session, immune to scheduler SIGHUP/SIGTERM. Lets
    # the matrix be restarted/retuned without corrupting in-flight claude. (2026-06-13.)
    setsid nohup bash "${ROOT}/scripts/bench/run-arm.sh" "$arm" "$model" "$effort" "$rep" "$BUDGET" >/dev/null 2>&1 &
    sleep 5
  done
done
wait
log "MATRIX DONE"
