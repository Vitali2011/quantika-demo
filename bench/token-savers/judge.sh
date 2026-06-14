#!/usr/bin/env bash
# judge.sh <task> <feature_arm> : duels baseline vs feature diffs, both orders, majority.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
task="$1" feat="$2"
out="$BASE/grades/$task/$feat"; mkdir -p "$out"

make_cfg judge "$BASE/grades/.jcfg"

duel() {
  local a="$1" b="$2" slot="$3"
  local prompt
  prompt="You are a strict code reviewer. Two diffs (A, B) solve the SAME task. Which is higher quality (correctness, completeness, no broken cross-file refs)? Reply with exactly one token: A or B.
=== DIFF A ===
$(cat "$a")
=== DIFF B ===
$(cat "$b")"
  printf '%s' "$prompt" \
    | CLAUDE_CONFIG_DIR="$BASE/grades/.jcfg" claude --print \
        --model claude-sonnet-4-6 \
        --output-format json 2>/dev/null \
    | node -e 'process.stdout.write((JSON.parse(require("fs").readFileSync(0,"utf8")).result||"").trim())' \
    > "$out/$slot.raw"
}

for r in 1 2 3; do
  bl="$RUNS/$task/baseline/r$r/agent.diff"
  ft="$RUNS/$task/$feat/r$r/agent.diff"
  [ -s "$bl" ] && [ -s "$ft" ] || continue
  # position-balanced: odd rep → baseline=A; even rep → feature=A
  if (( r % 2 )); then
    duel "$bl" "$ft" "r$r"
    echo "baseline" > "$out/r$r.Aslot"
  else
    duel "$ft" "$bl" "r$r"
    echo "$feat" > "$out/r$r.Aslot"
  fi
done
echo "Judge done: $task vs $feat"
