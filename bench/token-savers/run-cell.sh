#!/usr/bin/env bash
# run-cell.sh <task> <arm> <rep> <sha> <goal_file>
# Produces runs/<task>/<arm>/r<rep>/{result.json, agent.diff, out.log}
set -euo pipefail
source "$(dirname "$0")/lib.sh"; source "$(dirname "$0")/arms.sh"
task="$1" arm="$2" rep="$3" sha="$4" goal="$5"
# resolve goal to absolute (manifest paths are relative to $BASE)
[[ "$goal" = /* ]] || goal="$BASE/$goal"
cell="$RUNS/$task/$arm/r$rep"; rm -rf "$cell"; mkdir -p "$cell"
wt="$cell/wt"; cfg="$cell/.cfg"
worktree_at "$sha" "$wt"
[ "$task" = "probe" ] && bash "$(dirname "$0")/tasks/probe/seed.sh" "$wt" > "$cell/seed-oracle.txt"
make_cfg "$arm" "$cfg"; arm_apply "$arm" "$cfg"
sys_args=(); [ -n "${ARM_SYSPROMPT:-}" ] && sys_args=(--append-system-prompt "$ARM_SYSPROMPT")
# Isolate per-cell HOME so OAuth write-backs never touch global ~/.claude/.credentials.json.
# CLAUDE_CONFIG_DIR does not isolate credentials (HOME-based); per-cell HOME does.
KNOWN_CREDS="${KNOWN_CREDS:-$BASE/runs/smoke/baseline/r1/.cfg/.credentials.json}"
[ ! -f "$KNOWN_CREDS" ] && KNOWN_CREDS="$SRC_CFG/.credentials.json"
mkdir -p "$cell/home/.claude"
cp "$KNOWN_CREDS" "$cell/home/.claude/.credentials.json"
( cd "$wt" && HOME="$cell/home" CLAUDE_CONFIG_DIR="$cfg" claude --print \
    --model claude-sonnet-4-6 --permission-mode acceptEdits \
    --output-format json "${sys_args[@]}" \
    "$(cat "$goal")" > "$cell/result.json" 2> "$cell/out.log" ) || true
if [ -n "${TEST_CMD:-}" ]; then
  ( cd "$wt" && eval "$TEST_CMD" > "$cell/oracle.log" 2>&1 ) && echo PASS > "$cell/oracle.txt" || echo FAIL > "$cell/oracle.txt"
fi
git -C "$wt" add -A >/dev/null 2>&1 || true
git -C "$wt" diff --cached > "$cell/agent.diff" 2>/dev/null || true
git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1 || true
echo "$cell"
