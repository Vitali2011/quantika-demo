#!/usr/bin/env bash
# One plan-eval run. Stage 1: the plan-config writes a plan for the war-risk task (read-only).
# Stage 2: a FIXED Opus:high executor implements brief+plan via run-arm.sh. Then grade with #957.
# Usage: run-plan-arm.sh <arm> <plan_model> <plan_effort> <run> [plan_budget] [exec_budget]
# DRYRUN=1 prints the Stage-1 command and skips claude.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; PMODEL="${2:?plan_model}"; PEFFORT="${3:?plan_effort}"; RUN="${4:?run}"
PBUD="${5:-4}"; EBUD="${6:-8}"
OUT="${ROOT}/bench/plan-recon/results/plan/${ARM}/r${RUN}"; mkdir -p "$OUT"

# ---- Stage 1: generate the plan (read-only worktree at the war-risk start SHA) ----
WT="$(BENCH_DIR=plan-recon BENCH_SHA=e242d259 bash "${ROOT}/scripts/bench/new-run-worktree.sh" "planA-${ARM}" "$RUN")"
CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"
P1=(claude --print --output-format json --permission-mode acceptEdits --model "$PMODEL" --effort "$PEFFORT" --max-budget-usd "$PBUD")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN stage1 cwd=%s cmd=%s < %s\n' "$WT" "${P1[*]}" "${ROOT}/bench/plan-recon/plan-brief.md"
  git worktree remove --force "$WT"; exit 0
fi
( cd "$WT" && CLAUDE_CONFIG_DIR="$CLEAN" "${P1[@]}" < "${ROOT}/bench/plan-recon/plan-brief.md" ) \
  > "${OUT}/plan-run.json" 2> "${OUT}/plan-run.err" || true
python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
try: t=(json.load(open(f"{out}/plan-run.json")).get("result") or "").strip()
except Exception: t=""
open(f"{out}/plan.md","w").write(t)
print("PLAN_OK" if len(t)>200 else "PLAN_THIN")
PY
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/plan-run.json" > "${OUT}/plan-usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/plan-usage.tsv"
git worktree remove --force "$WT"

# ---- Stage 2: FIXED executor (Opus:high) implements brief + the generated plan ----
COMBINED="${OUT}/exec-brief.md"
{ cat "${ROOT}/bench/war-risk/brief.md"; echo; echo "## Approved implementation plan — follow it exactly:";
  echo; cat "${OUT}/plan.md"; } > "$COMBINED"
EXARM="planexec-${ARM}"
BENCH_DIR=plan-recon BENCH_BRIEF="$COMBINED" BENCH_PERM=acceptEdits \
  bash "${ROOT}/scripts/bench/run-arm.sh" "$EXARM" claude-opus-4-8 high "$RUN" "$EBUD"

# ---- Grade Stage-2 diff with the #957 hidden-test oracle ----
BENCH_DIR=plan-recon bash "${ROOT}/scripts/bench/grade-957.sh" "$EXARM" "$RUN"
echo "PLAN_RUN_DONE arm=${ARM} run=${RUN}"
