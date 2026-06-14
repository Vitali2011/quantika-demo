#!/usr/bin/env bash
# Run the root-match judge across all recon answers, throttled. Idempotent: skips an answer
# whose scores.json already has a "root" field.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-6}"
TASKS=(recon-976 recon-975)
ARMS=(sonnet-low sonnet-med sonnet-high sonnet-max opus-low opus-med opus-high)
running(){ pgrep -fc 'scripts/bench/judge-root.sh' 2>/dev/null || echo 0; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "root-judge-matrix start MAX_PAR=$MAX_PAR"
for task in "${TASKS[@]}"; do
  for arm in "${ARMS[@]}"; do
    for run in 1 2 3; do
      sc="${ROOT}/bench/plan-recon/grades/${task}/${arm}/r${run}/scores.json"
      [ -s "$sc" ] && grep -q '"root"' "$sc" 2>/dev/null && { log "skip ${task}/${arm} r${run}"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 8; done
      log "judge ${task}/${arm} r${run}"
      setsid nohup bash "${ROOT}/scripts/bench/judge-root.sh" "$task" "$arm" "$run" >/dev/null 2>&1 &
      sleep 2
    done
  done
done
wait
log "ROOT-JUDGE-MATRIX DONE"
