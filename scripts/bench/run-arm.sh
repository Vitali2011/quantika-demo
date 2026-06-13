#!/usr/bin/env bash
# Run ONE benchmarked solve: fresh worktree, claude solves the brief, capture diff+usage.
# Usage: run-arm.sh <arm> <model> <effort> <run> [budget_usd]
# DRYRUN=1 prints the command instead of calling claude (for tests).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; MODEL="${2:?model}"; EFFORT="${3:?effort}"; RUN="${4:?run}"; BUDGET="${5:-8}"
BRIEF="${ROOT}/bench/war-risk/brief.md"
OUT="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}"
mkdir -p "$OUT"

WT="$(bash "${ROOT}/scripts/bench/new-run-worktree.sh" "$ARM" "$RUN")"

CMD=(claude --print --output-format json --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN cwd=%s cmd=%s < %s\n' "$WT" "${CMD[*]}" "$BRIEF"
  git worktree remove --force "$WT"; exit 0
fi

# Run claude inside the worktree, feeding the brief on stdin.
( cd "$WT" && "${CMD[@]}" < "$BRIEF" ) > "${OUT}/run.json" 2> "${OUT}/run.err" || true

# Capture the produced diff (agent's changes vs the start SHA) and usage metrics.
git -C "$WT" add -A
git -C "$WT" diff --cached "$(git -C "$WT" rev-parse HEAD)" > "${OUT}/solution.diff" || true
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/run.json" > "${OUT}/usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/usage.tsv"

echo "RUN_DONE arm=${ARM} run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
