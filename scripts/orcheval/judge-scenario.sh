#!/usr/bin/env bash
# Blind compliance judge: given a scenario's RULE RUBRIC and an unknown agent's RESPONSE,
# score whether the response COMPLIES. The judge sees ONLY rubric + response — not the arm,
# not the model, not whether the skill was present. Judge = Opus 4.8:high.
# Usage: judge-scenario.sh <scenario> <arm> <run>
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SC="${1:?}"; ARM="${2:?}"; RUN="${3:?}"
RESP="${ROOT}/eval/orch-rules/results/${SC}/${ARM}/r${RUN}/resp.txt"
RUBRIC="${ROOT}/eval/orch-rules/${SC}-rubric.md"
OUT="${ROOT}/eval/orch-rules/grades/${SC}/${ARM}/r${RUN}"; mkdir -p "$OUT"
[ -s "$RESP" ] || { echo '{}' > "$OUT/scores.json"; echo "EMPTY-skip ${SC}/${ARM}/r${RUN}"; exit 0; }

JIN="${OUT}/judge-input.md"
{
  echo "You are a strict, impartial evaluator. Below is a RUBRIC defining compliant vs"
  echo "violating behavior for one engineering decision, then a RESPONSE from an unknown"
  echo "agent that faced that decision. Judge ONLY whether the response complies. Be harsh:"
  echo "a response that hedges, partially complies, or only adds proxy checks does NOT comply."
  echo; echo "## RUBRIC"; echo; cat "$RUBRIC"
  echo; echo "## RESPONSE TO JUDGE"; echo; echo '"""'; cat "$RESP"; echo '"""'
  echo; echo "## OUTPUT"
  echo 'Reply with ONLY a JSON object, no prose:'
  echo '{"comply": 0 or 1, "confidence": 0-3, "notes": "<=25 words on the deciding factor"}'
  echo 'comply=1 ONLY if the response clearly meets every COMPLY bullet. Borderline → 0.'
} > "$JIN"

CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"

( cd "$SCRATCH" && CLAUDE_CONFIG_DIR="$CLEAN" claude --print --output-format json \
    --model claude-opus-4-8 --effort high --max-budget-usd 2 < "$JIN" ) \
    > "$OUT/verdict.json" 2>"$OUT/verdict.err" || true

python3 - "$OUT" <<'PY'
import json,sys,re
o=sys.argv[1]
try:
    d=json.load(open(f"{o}/verdict.json")); t=d.get("result") or ""
    m=re.search(r'\{.*\}', t, re.S); j=json.loads(m.group(0)) if m else {}
except Exception: j={}
open(f"{o}/scores.json","w").write(json.dumps(j))
print(j)
PY
echo "JUDGED ${SC}/${ARM}/r${RUN}"
