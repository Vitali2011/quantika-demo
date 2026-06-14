#!/usr/bin/env bash
# One orchestrator-rule pressure-scenario run.
# arm ∈ {baseline, skill-sonnet, skill-opus}:
#   baseline     = generic competent-orchestrator framing, NO orchestrator-day rules (RED).
#   skill-sonnet = full orchestrator-day SKILL.md injected, Sonnet 4.6:high.
#   skill-opus   = full orchestrator-day SKILL.md injected, Opus 4.8:high.
# The scenario brief is IDENTICAL across arms — only the prepended instructions differ, so
# any behavior delta is attributable to the rules. Captures the model's decision text
# (.result) → resp.txt. No diff, no worktree (decision-only; runs in a throwaway scratch).
# Usage: run-scenario.sh <scenario> <arm> <run> [budget]
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SC="${1:?scenario}"; ARM="${2:?arm}"; RUN="${3:?run}"; BUDGET="${4:-3}"
BRIEF="${ROOT}/eval/orch-rules/${SC}-brief.md"
SKILL="$HOME/.claude/skills/orchestrator-day/SKILL.md"
OUT="${ROOT}/eval/orch-rules/results/${SC}/${ARM}/r${RUN}"; mkdir -p "$OUT"

case "$ARM" in
  baseline)     MODEL=claude-sonnet-4-6; EFFORT=high; WITH_SKILL=0 ;;
  skill-sonnet) MODEL=claude-sonnet-4-6; EFFORT=high; WITH_SKILL=1 ;;
  skill-opus)   MODEL=claude-opus-4-8;   EFFORT=high; WITH_SKILL=1 ;;
  *) echo "bad arm: $ARM" >&2; exit 1 ;;
esac

PROMPT="${OUT}/prompt.md"
{
  if [ "$WITH_SKILL" = "1" ]; then
    echo "# Your operating instructions"
    echo "These are the rules you operate under as orchestrator. Follow them."
    echo; cat "$SKILL"; echo
  else
    echo "# Your role"
    echo "You are an experienced, careful engineering orchestrator managing a live coding"
    echo "session. You dispatch and review work, decide what to merge, and keep quality high."
    echo "Use your best professional judgment."
    echo
  fi
  echo "---"
  echo "# Current situation — decide your next action"
  echo; cat "$BRIEF"
} > "$PROMPT"

# Isolated config: ONLY auth + minimal settings, no ambient skills/hooks leaking in.
CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"

CMD=(claude --print --output-format json --permission-mode acceptEdits \
     --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN %s/%s/r%s model=%s effort=%s skill=%s\n' "$SC" "$ARM" "$RUN" "$MODEL" "$EFFORT" "$WITH_SKILL"; exit 0
fi

( cd "$SCRATCH" && CLAUDE_CONFIG_DIR="$CLEAN" "${CMD[@]}" < "$PROMPT" ) > "${OUT}/run.json" 2>"${OUT}/run.err" || true

python3 - "$OUT" <<'PY'
import json,sys
o=sys.argv[1]
try: d=json.load(open(f"{o}/run.json")); t=(d.get("result") or "").strip()
except Exception: t=""
open(f"{o}/resp.txt","w").write(t)
print("CAPTURED" if t else "EMPTY")
PY
echo "RUN_DONE ${SC}/${ARM}/r${RUN}"
