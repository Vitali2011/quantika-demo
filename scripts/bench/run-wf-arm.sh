#!/usr/bin/env bash
# Dynamic-workflow benchmark arm: a 2-stage ORCHESTRATION (implement -> adversarial
# review+fix) on ONE isolated worktree. Same isolation + measurement as run-arm.sh,
# so it is directly comparable to the single-shot arms. Cost = sum of the two claude
# calls (exact JSON). Diff = combined worktree change vs the start SHA.
#
# Usage: run-wf-arm.sh <run> [model] [effort] [budget_per_call]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
RUN="${1:?run}"; MODEL="${2:-claude-opus-4-8}"; EFFORT="${3:-high}"; BUDGET="${4:-8}"
BRIEF="${ROOT}/bench/war-risk/brief.md"
REVIEW="${ROOT}/bench/war-risk/review-brief.md"
OUT="${ROOT}/bench/war-risk/results/dynamic-wf/r${RUN}"
mkdir -p "$OUT"

WT="$(bash "${ROOT}/scripts/bench/new-run-worktree.sh" dynamic-wf "$RUN")"

# Per-run isolated config (same as run-arm.sh): creds + acceptEdits only.
CFG="${OUT}/.cfg"; mkdir -p "$CFG"
cp "$HOME/.claude/.credentials.json" "$CFG/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CFG/settings.json"
COMMON=(--print --output-format json --permission-mode acceptEdits --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")

# --- Stage 1: implement ---
( cd "$WT" && CLAUDE_CONFIG_DIR="$CFG" claude "${COMMON[@]}" < "$BRIEF" ) > "${OUT}/impl.json" 2> "${OUT}/impl.err" || true

# Build the reviewer's input: the review template + the implementer's actual diff
# (acceptEdits blocks Bash, so the reviewer can't run `git diff` itself — embed it).
git -C "$WT" add -A
{ cat "$REVIEW"; echo; echo "## The implementer's diff to review and fix:"; echo '```diff';
  git -C "$WT" diff --cached "$(git -C "$WT" rev-parse HEAD)"; echo '```'; } > "${OUT}/review-input.md"

# --- Stage 2: adversarial review + fix ---
( cd "$WT" && CLAUDE_CONFIG_DIR="$CFG" claude "${COMMON[@]}" < "${OUT}/review-input.md" ) > "${OUT}/review.json" 2> "${OUT}/review.err" || true

# --- Capture combined solution + summed usage ---
git -C "$WT" add -A
git -C "$WT" diff --cached "$(git -C "$WT" rev-parse HEAD)" > "${OUT}/solution.diff" || true
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/impl.json"   > "${OUT}/impl.tsv"   2>/dev/null || printf '0\t0\t0\t0\t0\n' > "${OUT}/impl.tsv"
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/review.json" > "${OUT}/review.tsv" 2>/dev/null || printf '0\t0\t0\t0\t0\n' > "${OUT}/review.tsv"
# usage.tsv = impl + review (cost, dur_ms, in, out, turns) summed
awk -F'\t' '{for(i=1;i<=5;i++)a[i]+=$i} END{printf "%s\t%s\t%s\t%s\t%s\n",a[1],a[2],a[3],a[4],a[5]}' \
  "${OUT}/impl.tsv" "${OUT}/review.tsv" > "${OUT}/usage.tsv"

echo "WF_RUN_DONE run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
