#!/usr/bin/env bash
# Pilot: one real opus-med solve, then extrapolate full 6x3 matrix cost/time.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
bash "${ROOT}/scripts/bench/run-arm.sh" opus-med claude-opus-4-8 medium 1 8
IFS=$'\t' read -r COST MS IN OUT TURNS < "${ROOT}/bench/war-risk/results/opus-med/r1/usage.tsv"
echo "PILOT  cost=\$${COST}  durationMs=${MS}  in=${IN}  out=${OUT}  turns=${TURNS}"
npx tsx -e "
import { extrapolate } from './scripts/bench/estimate.ts';
const e = extrapolate({ pilotCostUsd:${COST:-0}, pilotDurationMs:${MS:-0}, arms:6, repeats:3, safety:1.3 });
console.log('ESTIMATE full', e.runs, 'runs ~ \$'+e.estCostUsd.toFixed(2), '| serial wall-clock ~'+e.estWallClockHoursSerial.toFixed(1)+'h');
"
