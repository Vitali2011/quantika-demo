#!/usr/bin/env bash
# Recon matrix: 4 configs × 2 tasks × REPS, throttled, RAM-gated, setsid-detached.
# Idempotent: skips runs whose recon.txt exists or whose worktree is live.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-3}"; MIN_AVAIL_MB="${MIN_AVAIL_MB:-2000}"; REPS="${REPS:-3}"; BUDGET="${BUDGET:-4}"

# task:sha
TASKS=( "recon-976:27b7ef4f" "recon-975:d7fa1f9a" )
# arm:model:effort
ARMS=(
  "sonnet-low:claude-sonnet-4-6:low"
  "sonnet-med:claude-sonnet-4-6:medium"
  "sonnet-high:claude-sonnet-4-6:high"
  "sonnet-max:claude-sonnet-4-6:max"
  "opus-low:claude-opus-4-8:low"
  "opus-med:claude-opus-4-8:medium"
  "opus-high:claude-opus-4-8:high"
)
avail_mb(){ free -m | awk '/^Mem:/{print $7}'; }
running(){ ls -d "${ROOT}/bench/plan-recon/worktrees/"*/ 2>/dev/null | wc -l; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "recon-matrix start MAX_PAR=$MAX_PAR REPS=$REPS"
for rep in $(seq 1 "$REPS"); do
  for t in "${TASKS[@]}"; do
    IFS=: read -r task sha <<< "$t"
    for spec in "${ARMS[@]}"; do
      IFS=: read -r arm model effort <<< "$spec"
      out="${ROOT}/bench/plan-recon/results/${task}/${arm}/r${rep}/recon.txt"
      wt="${ROOT}/bench/plan-recon/worktrees/${task}-${arm}-r${rep}"
      [ -f "$out" ] && { log "skip ${task}/${arm} r${rep} (done)"; continue; }
      [ -d "$wt" ]  && { log "skip ${task}/${arm} r${rep} (running)"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 20; done
      while [ "$(avail_mb)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait $(avail_mb)MB"; sleep 30; done
      log "launch ${task}/${arm} r${rep}"
      setsid nohup bash "${ROOT}/scripts/bench/run-recon-arm.sh" "$task" "$sha" "$arm" "$model" "$effort" "$rep" "$BUDGET" >/dev/null 2>&1 &
      sleep 5
    done
  done
done
wait
log "RECON-MATRIX DONE"
