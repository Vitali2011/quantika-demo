#!/usr/bin/env bash
# One recon run: fresh read worktree at the task's pre-fix SHA, claude investigates the
# symptom-only brief read-only, capture its TEXT answer (not a diff) + usage.
# Usage: run-recon-arm.sh <task> <sha> <arm> <model> <effort> <run> [budget]
# DRYRUN=1 prints the command instead of calling claude.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TASK="${1:?task}"; SHA="${2:?sha}"; ARM="${3:?arm}"; MODEL="${4:?model}"; EFFORT="${5:?effort}"
RUN="${6:?run}"; BUDGET="${7:-4}"
BRIEF="${ROOT}/bench/plan-recon/${TASK}-brief.md"
OUT="${ROOT}/bench/plan-recon/results/${TASK}/${ARM}/r${RUN}"; mkdir -p "$OUT"

WT="$(BENCH_DIR=plan-recon BENCH_SHA="$SHA" bash "${ROOT}/scripts/bench/new-run-worktree.sh" "${TASK}-${ARM}" "$RUN")"

# Isolated config: ONLY auth + minimal settings, no ambient skills/hooks (same validity fix as
# run-arm). acceptEdits gives the model full Read/Grep/Bash to investigate; the brief forbids edits
# and we capture text, not a diff, so any stray edit is discarded with the worktree.
CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"

CMD=(claude --print --output-format json --permission-mode acceptEdits --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN cwd=%s cmd=CLAUDE_CONFIG_DIR=%s %s < %s\n' "$WT" "$CLEAN" "${CMD[*]}" "$BRIEF"
  git worktree remove --force "$WT"; exit 0
fi

( cd "$WT" && CLAUDE_CONFIG_DIR="$CLEAN" "${CMD[@]}" < "$BRIEF" ) > "${OUT}/run.json" 2> "${OUT}/run.err" || true

# Extract the model's text answer (.result) → recon.txt; parse usage.
python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
try:
    d=json.load(open(f"{out}/run.json")); t=(d.get("result") or "").strip()
except Exception:
    t=""
open(f"{out}/recon.txt","w").write(t)
print("CAPTURED" if t else "EMPTY")
PY
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/run.json" > "${OUT}/usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/usage.tsv"

echo "RECON_DONE task=${TASK} arm=${ARM} run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
