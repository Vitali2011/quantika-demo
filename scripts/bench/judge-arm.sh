#!/usr/bin/env bash
# Blind judge for ONE solution: feed rubric + the diff to an isolated claude judge,
# capture its JSON verdict. Runs in an EMPTY scratch cwd so the judge cannot explore
# the repo — it scores only the diff it is shown. Same isolation rig as the arms.
# Usage: judge-arm.sh <arm> <run> [model] [effort]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; RUN="${2:?run}"; MODEL="${3:-claude-opus-4-8}"; EFFORT="${4:-high}"
SOL="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}/solution.diff"
OUT="${ROOT}/bench/war-risk/grades/${ARM}/r${RUN}"; mkdir -p "$OUT"
[ -s "$SOL" ] || { echo "NO_DIFF ${ARM} r${RUN}"; printf '{}\n' > "${OUT}/scores.json"; exit 0; }

CFG="${OUT}/.cfg"; mkdir -p "$CFG"
cp "$HOME/.claude/.credentials.json" "$CFG/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CFG/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"   # empty cwd: nothing for the judge to read

{ cat "${ROOT}/bench/war-risk/judge-rubric.md"; echo; echo '## Candidate diff:'; echo '```diff'; cat "$SOL"; echo '```'; } > "${OUT}/judge-input.md"

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
try:
    v=json.loads(t)
except Exception:
    m=re.search(r'\{.*\}', t, re.S)
    if m:
        try: v=json.loads(m.group(0))
        except Exception: v={}
json.dump(v, open(f"{out}/scores.json","w"))
print("OK" if v else "PARSE_FAIL")
PY
echo "JUDGED ${ARM} r${RUN}: $(cat ${OUT}/scores.json)"
