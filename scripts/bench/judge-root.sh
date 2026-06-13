#!/usr/bin/env bash
# Blind root-match judge for ONE recon answer. Feeds rubric + the gold root section for this task
# + the candidate recon text to an isolated claude judge in an empty cwd. Usage:
# judge-root.sh <task> <arm> <run> [model] [effort]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TASK="${1:?task}"; ARM="${2:?arm}"; RUN="${3:?run}"; MODEL="${4:-claude-opus-4-8}"; EFFORT="${5:-high}"
REC="${ROOT}/bench/plan-recon/results/${TASK}/${ARM}/r${RUN}/recon.txt"
OUT="${ROOT}/bench/plan-recon/grades/${TASK}/${ARM}/r${RUN}"; mkdir -p "$OUT"
[ -s "$REC" ] || { echo "NO_RECON ${TASK}/${ARM} r${RUN}"; printf '{}\n' > "${OUT}/scores.json"; exit 0; }

# Slice the gold-root section for THIS task (the "## <task...>" block) from recon-roots.md.
KEY="$(printf '%s' "$TASK" | sed 's/recon-/t/')"   # recon-976 -> t976
awk -v k="## ${KEY}" 'index($0,k){p=1} p&&/^## /&&index($0,k)==0&&NR>1{if(seen){exit}} p{print; seen=1}' \
   "${ROOT}/bench/plan-recon/recon-roots.md" > "${OUT}/gold.md"

CFG="${OUT}/.cfg"; mkdir -p "$CFG"
cp "$HOME/.claude/.credentials.json" "$CFG/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CFG/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"

{ cat "${ROOT}/bench/plan-recon/recon-judge-rubric.md"; echo; echo "## GOLD root cause:"; cat "${OUT}/gold.md";
  echo; echo "## Candidate analysis:"; echo '```'; cat "$REC"; echo '```'; } > "${OUT}/judge-input.md"

( cd "$SCRATCH" && CLAUDE_CONFIG_DIR="$CFG" claude --print --output-format json \
    --permission-mode acceptEdits --model "$MODEL" --effort "$EFFORT" --max-budget-usd 2 \
    < "${OUT}/judge-input.md" ) > "${OUT}/verdict.json" 2> "${OUT}/verdict.err" || true

python3 - "$OUT" <<'PY'
import json,re,sys
out=sys.argv[1]
try:
    d=json.load(open(f"{out}/verdict.json")); t=(d.get("result") or "").strip()
except Exception:
    t=""
v={}
try: v=json.loads(t)
except Exception:
    m=re.search(r'\{.*\}',t,re.S)
    if m:
        try: v=json.loads(m.group(0))
        except Exception: v={}
json.dump(v, open(f"{out}/scores.json","w"))
print("OK" if v else "PARSE_FAIL")
PY
echo "ROOT_JUDGED ${TASK}/${ARM} r${RUN}: $(cat ${OUT}/scores.json)"
