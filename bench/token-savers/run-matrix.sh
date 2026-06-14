#!/usr/bin/env bash
# run-matrix.sh — enumerate all cells, throttle by live worktrees, setsid-detach each.
# Full matrix: 3 tasks × 5 arms × 3 reps = 45 cells + probe (3 arms × 3 reps = 9 cells) = 54 total.
set -euo pipefail
cd "$(dirname "$0")"
source lib.sh
source arms.sh
source tasks/manifest.sh

MAXP="${MAXP:-4}"
mkdir -p runs

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a runs/matrix.log; }

launch() {
  local task="$1" arm="$2" rep="$3" sha="$4" goal="$5" testcmd="$6"
  while [ "$(count_live_worktrees)" -ge "$MAXP" ]; do sleep 20; done
  log "START cell: $task/$arm/r$rep"
  TEST_CMD="$testcmd" setsid bash run-cell.sh "$task" "$arm" "$rep" "$sha" "$goal" \
    >> runs/matrix.log 2>&1 &
  echo $! >> runs/pids.txt
}

log "MATRIX BEGIN — MAXP=$MAXP"
log "Feature tasks: ${FEATURE_TASKS[*]}, arms: ${ARMS[*]}, reps: 1 2 3"
log "Probe arms: baseline rtk all, reps: 1 2 3"
log "Total cells: 54"

# Feature tasks: all 5 arms × 3 reps
for t in "${FEATURE_TASKS[@]}"; do
  for a in "${ARMS[@]}"; do
    for r in 1 2 3; do
      launch "$t" "$a" "$r" "${TASK_SHA[$t]}" "${TASK_GOAL[$t]}" "${TASK_TEST[$t]}"
    done
  done
done

# rtk probe: baseline/rtk/all × 3 reps (no TEST_CMD — scored by recall)
for a in baseline rtk all; do
  for r in 1 2 3; do
    launch probe "$a" "$r" HEAD tasks/goals/probe.md ""
  done
done

wait
log "MATRIX DONE"
