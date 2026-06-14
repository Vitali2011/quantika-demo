#!/usr/bin/env bash
# Run the blind compliance judge across all eval responses, throttled. Idempotent: skips a
# response whose scores.json already has a "comply" field.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-6}"; REPS="${REPS:-3}"
SCENS=( s1-no-oracle s2-value-check s3-scope s4-recon )
ARMS=( baseline skill-sonnet skill-opus )
running(){ pgrep -fc 'orcheval/judge-scenario.sh' 2>/dev/null || echo 0; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "judge-matrix start MAX_PAR=$MAX_PAR"
for sc in "${SCENS[@]}"; do
  for arm in "${ARMS[@]}"; do
    for run in $(seq 1 "$REPS"); do
      sc_f="${ROOT}/eval/orch-rules/grades/${sc}/${arm}/r${run}/scores.json"
      [ -s "$sc_f" ] && grep -q '"comply"' "$sc_f" 2>/dev/null && { log "skip ${sc}/${arm} r${run}"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 6; done
      log "judge ${sc}/${arm} r${run}"
      setsid nohup bash "${ROOT}/scripts/orcheval/judge-scenario.sh" "$sc" "$arm" "$run" >/dev/null 2>&1 &
      sleep 2
    done
  done
done
wait
log "JUDGE-MATRIX DONE"
