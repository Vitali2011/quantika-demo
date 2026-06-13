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

# Isolated claude config — the ambient skill ecosystem (superpowers/orchestrator)
# hijacks the agent into writing a PLAN instead of code. Clean dir carries ONLY auth
# creds + minimal settings: no skills, no plugins, no hooks. (Validity fix 2026-06-13.)
CLEAN="${ROOT}/bench/war-risk/.clean-claude"
mkdir -p "$CLEAN"
[ -f "$CLEAN/.credentials.json" ] || cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"auto"}\n' > "$CLEAN/settings.json"

CMD=(claude --print --output-format json --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN cwd=%s cmd=CLAUDE_CONFIG_DIR=%s %s < %s\n' "$WT" "$CLEAN" "${CMD[*]}" "$BRIEF"
  git worktree remove --force "$WT"; exit 0
fi

# Run claude inside the worktree with isolated config, feeding the brief on stdin.
( cd "$WT" && CLAUDE_CONFIG_DIR="$CLEAN" "${CMD[@]}" < "$BRIEF" ) > "${OUT}/run.json" 2> "${OUT}/run.err" || true

# Capture the produced diff (agent's changes vs the start SHA) and usage metrics.
git -C "$WT" add -A
git -C "$WT" diff --cached "$(git -C "$WT" rev-parse HEAD)" > "${OUT}/solution.diff" || true
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/run.json" > "${OUT}/usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/usage.tsv"

echo "RUN_DONE arm=${ARM} run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
