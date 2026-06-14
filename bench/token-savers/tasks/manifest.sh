#!/usr/bin/env bash
# task | pre_sha | goal_file | test_cmd (run inside the agent's worktree)
# test_cmd exits 0 = oracle satisfied. Filled from Task 4 gate results.
# Oracle validation: FAIL at pre-SHA, PASS at merge SHA (all 3 confirmed).
declare -A TASK_SHA TASK_GOAL TASK_TEST

# PR #964 e9070fe2 — write-paths convergence
# pre-SHA 0bb8dc04: write-path-field-parity.test.ts did not exist → FAIL
# merge e9070fe2: test exists and passes (LLM boundary stubbed, offline) → PASS
TASK_SHA[pr964]="0bb8dc0460dd1108dc5605191829165c10a02c63"
TASK_GOAL[pr964]="tasks/goals/pr964.md"
TASK_TEST[pr964]="ln -sf /root/work/quantika-demo/node_modules node_modules 2>/dev/null; rtk jest lib/matching/__tests__/write-path-field-parity.test.ts --maxWorkers=1 --no-coverage --ci --forceExit"

# PR #965 40966379 — engine wave C (8 logic fixes)
# pre-SHA e9070fe2: matches-item-uniqueness.test.ts did not exist → FAIL
# merge 40966379: test exists and passes (4 tests, offline) → PASS
TASK_SHA[pr965]="e9070fe247ae90ee63f032a97e9b3bf8b2af90fc"
TASK_GOAL[pr965]="tasks/goals/pr965.md"
TASK_TEST[pr965]="ln -sf /root/work/quantika-demo/node_modules node_modules 2>/dev/null; rtk jest lib/matching/__tests__/matches-item-uniqueness.test.ts --maxWorkers=1 --no-coverage --ci --forceExit"

# PR #970 1a79b6c5 — wave D (vessel passport/lastcargoes/ROI + dead-code cleanup)
# pre-SHA 7499056d: parse-vessel-lastcargoes.test.ts did not exist → FAIL
# merge 1a79b6c5: test exists and passes (5 tests, offline pure parsing) → PASS
TASK_SHA[pr970]="7499056df1775984ce8a1ab109a041dd215eb447"
TASK_GOAL[pr970]="tasks/goals/pr970.md"
TASK_TEST[pr970]="ln -sf /root/work/quantika-demo/node_modules node_modules 2>/dev/null; rtk jest lib/__tests__/parse-vessel-lastcargoes.test.ts --maxWorkers=1 --no-coverage --ci --forceExit"

FEATURE_TASKS=(pr964 pr965 pr970)
