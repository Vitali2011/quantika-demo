#!/usr/bin/env bash
# Run the #957 objective oracle across all 21 solutions, throttled (jest is heavier
# than the judge). Idempotent: skips a solution whose h957.summary already has a result.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-3}"
ARMS=(sonnet-max opus-low opus-med opus-high opus-xhigh opus-max dynamic-wf)
running(){ pgrep -fc 'scripts/bench/grade-957.sh' 2>/dev/null || echo 0; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "957-matrix start MAX_PAR=$MAX_PAR"
for arm in "${ARMS[@]}"; do
  for run in 1 2 3; do
    s="${ROOT}/bench/war-risk/grades/${arm}/r${run}/h957.summary"
    [ -s "$s" ] && grep -q Tests "$s" && { log "skip $arm r$run (done)"; continue; }
    while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 10; done
    log "957 $arm r$run"
    setsid nohup bash "${ROOT}/scripts/bench/grade-957.sh" "$arm" "$run" >/dev/null 2>&1 &
    sleep 3
  done
done
wait
log "957-MATRIX DONE"
