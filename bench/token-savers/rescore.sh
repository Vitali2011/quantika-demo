#!/usr/bin/env bash
# rescore.sh — re-score 45 eval cells using saved agent.diff + real test file overlay
# Bug: original oracle used pre-SHA worktree with no test file → all FAIL.
# Fix: apply diff, then git-checkout real test from merge-SHA, run jest.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="/root/work/quantika-demo"
RUNS="$SCRIPT_DIR/runs"

declare -A PRE_SHA MERGE_SHA TEST_FILE

# Pre-SHAs (where agents ran — test files did NOT exist here)
PRE_SHA[pr964]="0bb8dc0460dd1108dc5605191829165c10a02c63"
PRE_SHA[pr965]="e9070fe247ae90ee63f032a97e9b3bf8b2af90fc"
PRE_SHA[pr970]="7499056df1775984ce8a1ab109a041dd215eb447"

# Merge SHAs (test files exist and pass here)
MERGE_SHA[pr964]="e9070fe2"
MERGE_SHA[pr965]="40966379"
MERGE_SHA[pr970]="1a79b6c5"

# Test files to overlay from merge-SHA
TEST_FILE[pr964]="lib/matching/__tests__/write-path-field-parity.test.ts"
TEST_FILE[pr965]="lib/matching/__tests__/matches-item-uniqueness.test.ts"
TEST_FILE[pr970]="lib/__tests__/parse-vessel-lastcargoes.test.ts"

TASKS=(pr964 pr965 pr970)
ARMS=(baseline caveman rtk cavecrew all)
REPS=(1 2 3)

pass=0 fail=0 apply_fail=0 empty_skip=0 total=0

for task in "${TASKS[@]}"; do
  for arm in "${ARMS[@]}"; do
    for rep in "${REPS[@]}"; do
      total=$((total + 1))
      cell="$RUNS/$task/$arm/r$rep"
      diff_file="$cell/agent.diff"
      oracle_out="$cell/oracle.txt"
      oracle_log="$cell/oracle-rescore.log"

      printf '[%d/45] %s/%s/r%s ... ' "$total" "$task" "$arm" "$rep"

      # Empty diff → no implementation
      if [ ! -s "$diff_file" ]; then
        echo "FAIL" > "$oracle_out"
        echo "SKIP (empty diff)"
        empty_skip=$((empty_skip + 1))
        continue
      fi

      # Fresh detached worktree at pre-SHA
      wt="$(mktemp -d /tmp/rescore-wt-XXXXXX)"
      rmdir "$wt"

      if ! git -C "$REPO" worktree add --detach "$wt" "${PRE_SHA[$task]}" >/dev/null 2>&1; then
        echo "FAIL" > "$oracle_out"
        echo "ERR: worktree-add failed"
        fail=$((fail + 1))
        continue
      fi

      # Symlink node_modules from main repo
      ln -sf "$REPO/node_modules" "$wt/node_modules"

      # Apply agent diff with 3-way merge
      if ! git -C "$wt" apply --3way "$diff_file" >/dev/null 2>&1; then
        echo "APPLY-FAIL" > "$oracle_out"
        echo "APPLY-FAIL"
        git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1 || true
        apply_fail=$((apply_fail + 1))
        continue
      fi

      # Overlay real test from merge-SHA (ground truth replaces whatever agent wrote)
      git -C "$wt" checkout "${MERGE_SHA[$task]}" -- "${TEST_FILE[$task]}" >/dev/null 2>&1

      # Run jest against real test file
      if ( cd "$wt" && rtk jest "${TEST_FILE[$task]}" --maxWorkers=1 --no-coverage --ci --forceExit > "$oracle_log" 2>&1 ); then
        echo "PASS" > "$oracle_out"
        echo "PASS"
        pass=$((pass + 1))
      else
        echo "FAIL" > "$oracle_out"
        echo "FAIL"
        fail=$((fail + 1))
      fi

      # Remove scratch worktree
      git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1 || true
    done
  done
done

echo ""
echo "=== RESCORE DONE ==="
echo "PASS=$pass FAIL=$fail APPLY-FAIL=$apply_fail EMPTY-SKIP=$empty_skip TOTAL=$total"
