#!/usr/bin/env bash
# Orchestrator-rule eval matrix: SCENARIOS × ARMS × REPS, throttled + RAM-gated, detached.
# Idempotent: skips a run whose resp.txt already exists. No worktrees → no git-worktree race
# (each run is decision-only in its own scratch dir).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-4}"; REPS="${REPS:-3}"; MIN_AVAIL_MB="${MIN_AVAIL_MB:-2000}"; BUDGET="${BUDGET:-3}"
SCENS=( s1-no-oracle s2-value-check s3-scope s4-recon )
ARMS=( baseline skill-sonnet skill-opus )
avail(){ free -m | awk '/^Mem:/{print $7}'; }
running(){ pgrep -fc 'orcheval/run-scenario.sh' 2>/dev/null || echo 0; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "orch-eval start MAX_PAR=$MAX_PAR REPS=$REPS scen=${#SCENS[@]} arms=${#ARMS[@]}"
for rep in $(seq 1 "$REPS"); do
  for sc in "${SCENS[@]}"; do
    for arm in "${ARMS[@]}"; do
      out="${ROOT}/eval/orch-rules/results/${sc}/${arm}/r${rep}/resp.txt"
      [ -s "$out" ] && { log "skip ${sc}/${arm} r${rep} (done)"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 10; done
      while [ "$(avail)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait $(avail)MB"; sleep 20; done
      log "launch ${sc}/${arm} r${rep}"
      setsid nohup bash "${ROOT}/scripts/orcheval/run-scenario.sh" "$sc" "$arm" "$rep" "$BUDGET" >/dev/null 2>&1 &
      sleep 4
    done
  done
done
wait
log "ORCH-EVAL DONE"
