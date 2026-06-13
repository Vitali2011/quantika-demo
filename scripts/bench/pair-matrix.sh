#!/usr/bin/env bash
# Blind A/B panel over the contested pairs, 3 rep-matched duels each. Idempotent.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
running(){ pgrep -fc 'scripts/bench/judge-pair.sh' 2>/dev/null || echo 0; }
PAIRS=("opus-med opus-high" "opus-med dynamic-wf" "opus-high opus-max")
echo "pair-matrix start"
for p in "${PAIRS[@]}"; do
  set -- $p
  for run in 1 2 3; do
    o="${ROOT}/bench/war-risk/grades/_pairs/${1}__vs__${2}/r${run}/pair.json"
    [ -s "$o" ] && { echo "skip $1 vs $2 r$run"; continue; }
    while [ "$(running)" -ge 6 ]; do sleep 5; done
    echo "duel $1 vs $2 r$run"
    setsid nohup bash "${ROOT}/scripts/bench/judge-pair.sh" "$1" "$2" "$run" >/dev/null 2>&1 &
    sleep 2
  done
done
wait
echo "PAIR-MATRIX DONE"
