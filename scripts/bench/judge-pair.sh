#!/usr/bin/env bash
# Blind A/B head-to-head between two solutions of the same rep. Anti-position-bias:
# the actual arm shown as "A" alternates by run parity, then the winner is mapped back
# to the real arm. Usage: judge-pair.sh <armX> <armY> <run>
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
X="${1:?armX}"; Y="${2:?armY}"; RUN="${3:?run}"
DX="${ROOT}/bench/war-risk/results/${X}/r${RUN}/solution.diff"
DY="${ROOT}/bench/war-risk/results/${Y}/r${RUN}/solution.diff"
OUT="${ROOT}/bench/war-risk/grades/_pairs/${X}__vs__${Y}/r${RUN}"; mkdir -p "$OUT"

# Alternate position by run parity: odd -> X is A; even -> Y is A.
if [ $(( RUN % 2 )) -eq 1 ]; then SA="$X"; SB="$Y"; FA="$DX"; FB="$DY"; else SA="$Y"; SB="$X"; FA="$DY"; FB="$DX"; fi

CFG="${OUT}/.cfg"; mkdir -p "$CFG"
cp "$HOME/.claude/.credentials.json" "$CFG/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CFG/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"

{ cat "${ROOT}/bench/war-risk/pair-rubric.md"; echo; echo "## Solution A:"; echo '```diff'; cat "$FA"; echo '```';
  echo "## Solution B:"; echo '```diff'; cat "$FB"; echo '```'; } > "${OUT}/pair-input.md"

( cd "$SCRATCH" && CLAUDE_CONFIG_DIR="$CFG" claude --print --output-format json \
    --permission-mode acceptEdits --model claude-opus-4-8 --effort high --max-budget-usd 2 \
    < "${OUT}/pair-input.md" ) > "${OUT}/verdict.json" 2> "${OUT}/verdict.err" || true

python3 - "$OUT" "$SA" "$SB" <<'PY'
import json,re,sys
out,sa,sb=sys.argv[1],sys.argv[2],sys.argv[3]
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
w=v.get("winner","")
actual = sa if w=="A" else (sb if w=="B" else "tie")
json.dump({"winner_pos":w,"winner_arm":actual,"A_was":sa,"B_was":sb,"reason":v.get("reason","")}, open(f"{out}/pair.json","w"))
print(f"{sa}=A vs {sb}=B -> {w} = {actual}")
PY
