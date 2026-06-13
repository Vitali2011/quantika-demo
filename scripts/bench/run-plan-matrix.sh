#!/usr/bin/env bash
# Plan matrix: 3 plan-configs × REPS. Serial-ish (each run already spawns a Stage-2 executor +
# jest), throttled by live worktree count under plan-recon. Idempotent on the #957 summary.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-2}"; MIN_AVAIL_MB="${MIN_AVAIL_MB:-2500}"; REPS="${REPS:-3}"
# arm:plan_model:plan_effort
ARMS=( "plan-med:claude-opus-4-8:medium" "plan-high:claude-opus-4-8:high" "plan-max:claude-opus-4-8:max" )
avail_mb(){ free -m | awk '/^Mem:/{print $7}'; }
running(){ ls -d "${ROOT}/bench/plan-recon/worktrees/"*/ 2>/dev/null | wc -l; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "plan-matrix start MAX_PAR=$MAX_PAR REPS=$REPS"
for rep in $(seq 1 "$REPS"); do
  for spec in "${ARMS[@]}"; do
    IFS=: read -r arm model effort <<< "$spec"
    done_f="${ROOT}/bench/plan-recon/grades/planexec-${arm}/r${rep}/h957.summary"
    [ -s "$done_f" ] && grep -q Tests "$done_f" && { log "skip ${arm} r${rep} (done)"; continue; }
    while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 20; done
    while [ "$(avail_mb)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait $(avail_mb)MB"; sleep 30; done
    log "launch ${arm} r${rep}"
    setsid nohup bash "${ROOT}/scripts/bench/run-plan-arm.sh" "$arm" "$model" "$effort" "$rep" >/dev/null 2>&1 &
    sleep 8
  done
done
wait
log "PLAN-MATRIX DONE"
