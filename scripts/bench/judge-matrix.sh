#!/usr/bin/env bash
# Run the blind judge across all 21 solutions, throttled. Idempotent: skips a solution
# whose scores.json already parses to a non-empty verdict.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-6}"
ARMS=(sonnet-max opus-low opus-med opus-high opus-xhigh opus-max dynamic-wf)
running() { pgrep -fc 'scripts/bench/judge-arm.sh' 2>/dev/null || echo 0; }
log() { echo "[$(date +%H:%M:%S)] $*"; }

log "judge-matrix start MAX_PAR=$MAX_PAR"
for arm in "${ARMS[@]}"; do
  for run in 1 2 3; do
    sc="${ROOT}/bench/war-risk/grades/${arm}/r${run}/scores.json"
    if [ -s "$sc" ] && ! grep -q '^{}$' "$sc" 2>/dev/null && grep -q overall "$sc" 2>/dev/null; then
      log "skip ${arm} r${run} (judged)"; continue
    fi
    while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 8; done
    log "judge ${arm} r${run}"
    setsid nohup bash "${ROOT}/scripts/bench/judge-arm.sh" "$arm" "$run" >/dev/null 2>&1 &
    sleep 2
  done
done
wait
log "JUDGE-MATRIX DONE"
