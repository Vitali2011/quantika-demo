# Token-Savers Quality Eval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a committed, reproducible harness that measures whether `caveman`, `rtk`, and `cavecrew` degrade coding quality, run it (~54 Sonnet-4.6 sessions) on the dev-VPS rig, and produce a per-feature verdict.

**Architecture:** Each cell = one isolated `claude --print` coding agent in a throwaway git worktree at a fixed pre-SHA, with a per-run `CLAUDE_CONFIG_DIR` that toggles exactly one saver. A matrix runner throttles by live-worktree count. Quality is triangulated: objective test pass/fail on the agent's diff + blind position-balanced pairwise judge + (for rtk) a seeded-bug recall probe. An aggregator emits `bench/token-savers/RESULTS.md`.

**Tech Stack:** bash (driver), `claude --print --output-format json`, `git worktree`, `node`/`jq` (aggregation), the proven `.cfg` layout from the prior war-risk bench (`{"defaultMode":"acceptEdits"}` + copied credentials).

**Where it runs:** dev-VPS `root@157.173.124.116`, repo `/root/work/quantika-demo`. Harness committed to branch `eval/token-savers-quality`. The prior bench driver was ephemeral and lost — **this one is committed**.

---

## File Structure

All under `bench/token-savers/` (committed; run artifacts gitignored):

- `lib.sh` — shared helpers: `make_cfg <arm> <dir>`, `worktree_at <sha> <dir>`, `count_live_worktrees`, token/cost extraction from result JSON.
- `arms.sh` — declares the 5 arms and, per arm, the config-dir mutations + the `--append-system-prompt` payload.
- `tasks/manifest.sh` — declares the 4 tasks: 3 PR replays (pre-SHA, goal text path, test command) + the rtk probe (seed script, oracle locations).
- `tasks/goals/<task>.md` — the prompt handed to the agent per task.
- `tasks/probe/seed.sh` + `tasks/probe/oracle.txt` — rtk probe seeding + expected `file:line` locations.
- `run-cell.sh` — run ONE (task, arm, rep): worktree + cfg + `claude --print` + capture diff/json/test-result.
- `run-matrix.sh` — enumerate all cells, throttle, `setsid`-detach, write a manifest of cell dirs.
- `judge.sh` — blind pairwise judge over `baseline` vs feature diffs, position-balanced.
- `aggregate.mjs` — fold test results + judge votes + usage JSON → `RESULTS.md`.
- `.gitignore` — ignore `runs/`, `grades/`, `*.log`.

---

## Phase 0 — Rig skeleton + 1-cell smoke

### Task 1: Scaffold dir + gitignore + lib.sh

**Files:**

- Create: `bench/token-savers/.gitignore`
- Create: `bench/token-savers/lib.sh`

- [ ] **Step 1: Create gitignore**

```
runs/
grades/
*.log
*.tmp
```

- [ ] **Step 2: Write lib.sh**

```bash
#!/usr/bin/env bash
# Shared helpers for the token-savers eval rig.
set -euo pipefail
REPO="${REPO:-/root/work/quantika-demo}"
BASE="$REPO/bench/token-savers"
RUNS="$BASE/runs"
SRC_CFG="${SRC_CFG:-$HOME/.claude}"   # source of credentials

# make_cfg <arm> <destdir>: build a per-run CLAUDE_CONFIG_DIR.
# Clean (no ambient skills) by default; arms.sh mutates it further.
make_cfg() {
  local arm="$1" dir="$2"
  mkdir -p "$dir"
  printf '{"defaultMode":"acceptEdits"}' > "$dir/settings.json"
  # copy creds only (NOT settings/skills) so superpowers can't hijack into a plan
  cp "$SRC_CFG/.credentials.json" "$dir/.credentials.json" 2>/dev/null || true
}

# worktree_at <sha> <dir>: detached worktree at a fixed SHA.
worktree_at() {
  local sha="$1" dir="$2"
  git -C "$REPO" worktree add --detach "$dir" "$sha" >/dev/null
}

# count_live_worktrees: number of active eval worktrees (throttle signal).
count_live_worktrees() { git -C "$REPO" worktree list | grep -c "$RUNS/" || true; }

# usage_from_json <result.json> -> "cost_usd duration_ms input_tok output_tok"
usage_from_json() {
  node -e '
    const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const u=j.usage||{};
    console.log([j.total_cost_usd||0, j.duration_ms||0, u.input_tokens||0, u.output_tokens||0].join(" "));
  ' "$1"
}
```

- [ ] **Step 3: Commit**

```bash
cd /root/work/quantika-demo
git add bench/token-savers/.gitignore bench/token-savers/lib.sh
git commit -m "eval(token-savers): rig scaffold + lib.sh helpers"
```

### Task 2: arms.sh — the 5 arm definitions

**Files:**

- Create: `bench/token-savers/arms.sh`

- [ ] **Step 1: Write arms.sh**

```bash
#!/usr/bin/env bash
# Per-arm config mutations. Each arm function takes the run's cfg dir + prints
# the --append-system-prompt payload (empty if none) on stdout via ARM_SYSPROMPT.
set -euo pipefail
ARMS=(baseline caveman rtk cavecrew all)

CAVEMAN_DIRECTIVE='Respond in caveman style: drop articles, filler, pleasantries, hedging. Fragments OK. Keep ALL technical substance exact. Code blocks unchanged.'

arm_apply() {            # arm_apply <arm> <cfgdir>  -> sets ARM_SYSPROMPT
  local arm="$1" cfg="$2"; ARM_SYSPROMPT=""
  case "$arm" in
    baseline) ;;
    caveman)  ARM_SYSPROMPT="$CAVEMAN_DIRECTIVE" ;;
    rtk)      CLAUDE_CONFIG_DIR="$cfg" rtk init -g >/dev/null 2>&1 || true ;;
    cavecrew) _install_cavecrew "$cfg" ;;
    all)      ARM_SYSPROMPT="$CAVEMAN_DIRECTIVE"
              CLAUDE_CONFIG_DIR="$cfg" rtk init -g >/dev/null 2>&1 || true
              _install_cavecrew "$cfg" ;;
  esac
}

# cavecrew = caveman plugin present so cavecrew-* subagents are available.
_install_cavecrew() {
  local cfg="$1"
  mkdir -p "$cfg/plugins"
  cp -R "$HOME/.claude/plugins/"*caveman* "$cfg/plugins/" 2>/dev/null || true
}
```

- [ ] **Step 2: Verify rtk hook lands in cfg (smoke)**

Run:

```bash
cd /root/work/quantika-demo && source bench/token-savers/lib.sh && source bench/token-savers/arms.sh
d=$(mktemp -d); make_cfg rtk "$d"; arm_apply rtk "$d"; grep -q rtk "$d/settings.json" && echo "RTK HOOK OK" || echo "NO HOOK"; rm -rf "$d"
```

Expected: `RTK HOOK OK`

- [ ] **Step 3: Commit**

```bash
git add bench/token-savers/arms.sh
git commit -m "eval(token-savers): arm definitions (baseline/caveman/rtk/cavecrew/all)"
```

### Task 3: run-cell.sh — single cell + baseline smoke

**Files:**

- Create: `bench/token-savers/run-cell.sh`

- [ ] **Step 1: Write run-cell.sh**

```bash
#!/usr/bin/env bash
# run-cell.sh <task> <arm> <rep> <sha> <goal_file>
# Produces runs/<task>/<arm>/r<rep>/{result.json, agent.diff, out.log}
set -euo pipefail
source "$(dirname "$0")/lib.sh"; source "$(dirname "$0")/arms.sh"
task="$1" arm="$2" rep="$3" sha="$4" goal="$5"
cell="$RUNS/$task/$arm/r$rep"; rm -rf "$cell"; mkdir -p "$cell"
wt="$cell/wt"; cfg="$cell/.cfg"
worktree_at "$sha" "$wt"
make_cfg "$arm" "$cfg"; arm_apply "$arm" "$cfg"
sys_args=(); [ -n "${ARM_SYSPROMPT:-}" ] && sys_args=(--append-system-prompt "$ARM_SYSPROMPT")
( cd "$wt" && CLAUDE_CONFIG_DIR="$cfg" claude --print \
    --model claude-sonnet-4-6 --permission-mode acceptEdits \
    --output-format json "${sys_args[@]}" \
    "$(cat "$goal")" > "$cell/result.json" 2> "$cell/out.log" ) || true
git -C "$wt" add -A >/dev/null 2>&1 || true
git -C "$wt" diff --cached > "$cell/agent.diff" 2>/dev/null || true
git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1 || true
echo "$cell"
```

- [ ] **Step 2: Smoke on a trivial goal at HEAD**

Run:

```bash
cd /root/work/quantika-demo
printf 'Add a one-line code comment `// eval-smoke` at the top of README.md.' > /tmp/smoke-goal.md
bash bench/token-savers/run-cell.sh smoke baseline 1 HEAD /tmp/smoke-goal.md
test -s bench/token-savers/runs/smoke/baseline/r1/agent.diff && echo "DIFF PRODUCED" || echo "EMPTY DIFF (permission trap?)"
bench/token-savers/runs/smoke/baseline/r1/result.json
```

Expected: `DIFF PRODUCED` and a non-empty `result.json` with a `usage` block. If `EMPTY DIFF`, the permission mode is wrong — stop and fix before scaling.

- [ ] **Step 3: Commit**

```bash
git add bench/token-savers/run-cell.sh
git commit -m "eval(token-savers): single-cell runner + verified non-empty diff"
```

---

## Phase 1 — Pin the task corpus (oracle validation gates)

### Task 4: Validate the 3 PR oracles (offline-runnable, fails-at-pre/passes-at-merge)

**Files:**

- Create: `bench/token-savers/tasks/manifest.sh`
- Create: `bench/token-savers/tasks/goals/pr964.md`, `pr965.md`, `pr970.md`

- [ ] **Step 1: For each PR, derive pre-SHA + candidate test subset**

Run (per PR; example #965):

```bash
cd /root/work/quantika-demo
M=40966379; PRE=$(git rev-parse "$M^")
echo "pre-SHA=$PRE"
git diff --name-only "$PRE" "$M" | grep -E '\.(test|spec)\.[tj]sx?$'
```

Record the merge SHA, `pre = merge^`, and the changed test files.

- [ ] **Step 2: Gate — test subset must be a valid oracle AND offline**

Run (at merge SHA, in a scratch worktree, with the test files):

```bash
git -C /root/work/quantika-demo worktree add --detach /tmp/o965 40966379
( cd /tmp/o965 && npm ci >/dev/null 2>&1; rtk jest <test-files> 2>&1 | tail -20 )
git -C /root/work/quantika-demo worktree remove --force /tmp/o965
```

Expected: tests PASS at merge with NO live-LLM calls (dev-LLM is down — a test that needs gemini/bedrock is disqualified). Then repeat at `pre` and expect FAIL.
**If a PR fails this gate** (no offline test, or tests don't flip pre→merge): substitute the nearest recent PR of the same class (data / engine-logic / UI) and re-run the gate. Log the substitution in `RESULTS.md`.

- [ ] **Step 3: Write the goal prompt per PR**

Each `tasks/goals/prNNN.md` contains: the PR's issue/goal text (paste from `gh pr view NNN --json title,body`), plus the instruction line:

```
Implement the change described above. Before using any Next.js/React API introduced or changed after v14, WebFetch the relevant nextjs.org/react.dev docs page first. Do not edit test files.
```

- [ ] **Step 4: Write manifest.sh**

```bash
#!/usr/bin/env bash
# task | pre_sha | goal_file | test_cmd (run inside the agent's worktree)
# test_cmd exits 0 = oracle satisfied. Filled from Task 4 gate results.
declare -A TASK_SHA TASK_GOAL TASK_TEST
TASK_SHA[pr964]="<pre964>"; TASK_GOAL[pr964]="tasks/goals/pr964.md"; TASK_TEST[pr964]="rtk jest <files964>"
TASK_SHA[pr965]="<pre965>"; TASK_GOAL[pr965]="tasks/goals/pr965.md"; TASK_TEST[pr965]="rtk jest <files965>"
TASK_SHA[pr970]="<pre970>"; TASK_GOAL[pr970]="tasks/goals/pr970.md"; TASK_TEST[pr970]="rtk jest <files970>"
FEATURE_TASKS=(pr964 pr965 pr970)
```

- [ ] **Step 5: Commit**

```bash
git add bench/token-savers/tasks
git commit -m "eval(token-savers): pin 3 PR oracles (validated offline + pre/merge flip)"
```

### Task 5: Build the rtk diagnostic probe

**Files:**

- Create: `bench/token-savers/tasks/probe/seed.sh`
- Create: `bench/token-savers/tasks/probe/oracle.txt`
- Create: `bench/token-savers/tasks/goals/probe.md`

- [ ] **Step 1: Write seed.sh — inject 5 detectable issues into a worktree**

```bash
#!/usr/bin/env bash
# seed.sh <worktree> : plant 5 stale/contradictory directives, echo their file:line to stdout.
set -euo pipefail; wt="$1"
plant() { # <file> <marker-line-text>
  echo "$2" >> "$wt/$1"; echo "$1:$(wc -l < "$wt/$1" | tr -d ' ')";
}
plant docs/SEED_A.md "STALE: references middleware-045 which was removed"
plant docs/SEED_B.md "CONTRADICTION: says KNOWLEDGE_RAG_ENABLED default true (actual: false)"
plant docs/SEED_C.md "STALE: points to lib/old-retriever.ts (deleted)"
plant docs/SEED_D.md "WRONG: claims claude-cli allowed in request handlers"
plant docs/SEED_E.md "STALE: ADMIN_TOKEN optional (actual: 500 if unset)"
```

(The seeded files are created fresh in each probe worktree; the oracle is the printed `file:line` set.)

- [ ] **Step 2: Write probe goal**

`tasks/goals/probe.md`:

```
Audit every file under docs/ for stale, wrong, or self-contradictory directives.
Output ONE line per issue you find as `path:line — <why>`. Be exhaustive.
```

- [ ] **Step 3: Smoke seed.sh**

Run:

```bash
git -C /root/work/quantika-demo worktree add --detach /tmp/probewt HEAD
bash bench/token-savers/tasks/probe/seed.sh /tmp/probewt
git -C /root/work/quantika-demo worktree remove --force /tmp/probewt
```

Expected: 5 `file:line` lines printed.

- [ ] **Step 4: Commit**

```bash
git add bench/token-savers/tasks/probe bench/token-savers/tasks/goals/probe.md
git commit -m "eval(token-savers): rtk diagnostic probe (5 seeded issues + oracle)"
```

---

## Phase 2 — Scoring

### Task 6: Objective test scorer (folded into run-matrix)

**Files:**

- Modify: `bench/token-savers/run-cell.sh` (append oracle run when `TASK_TEST` set)

- [ ] **Step 1: After diff capture, run the task's test_cmd in the worktree BEFORE removal**

Insert before `worktree remove` in run-cell.sh:

```bash
if [ -n "${TEST_CMD:-}" ]; then
  ( cd "$wt" && eval "$TEST_CMD" > "$cell/oracle.log" 2>&1 ) && echo PASS > "$cell/oracle.txt" || echo FAIL > "$cell/oracle.txt"
fi
```

(run-matrix exports `TEST_CMD` per task; probe leaves it empty and is scored by Task 8.)

- [ ] **Step 2: Smoke — oracle.txt appears**

Run the Phase-0 smoke again with `TEST_CMD='test -f README.md'`; expect `bench/token-savers/runs/smoke/baseline/r1/oracle.txt` == `PASS`.

- [ ] **Step 3: Commit**

```bash
git add bench/token-savers/run-cell.sh
git commit -m "eval(token-savers): objective oracle run inside cell"
```

### Task 7: judge.sh — blind position-balanced pairwise

**Files:**

- Create: `bench/token-savers/judge.sh`

- [ ] **Step 1: Write judge.sh**

```bash
#!/usr/bin/env bash
# judge.sh <task> <feature_arm> : duels baseline vs feature diffs, both orders, majority.
set -euo pipefail; source "$(dirname "$0")/lib.sh"
task="$1" feat="$2"; out="$BASE/grades/$task/$feat"; mkdir -p "$out"
duel() { # <A_diff> <B_diff> <slot>  -> writes winner (A|B) to $out/<slot>.winner
  local a="$1" b="$2" slot="$3"
  local p="You are a strict code reviewer. Two diffs (A, B) solve the SAME task. Which is higher quality (correctness, completeness, no broken cross-file refs)? Reply with exactly one token: A or B.
=== DIFF A ===
$(cat "$a")
=== DIFF B ===
$(cat "$b")"
  printf '%s' "$p" | CLAUDE_CONFIG_DIR="$BASE/grades/.jcfg" claude --print --model claude-sonnet-4-6 \
     --output-format json 2>/dev/null | node -e 'process.stdout.write((JSON.parse(require("fs").readFileSync(0,"utf8")).result||"").trim())' > "$out/$slot.raw"
  echo "$out/$slot.raw"
}
make_cfg judge "$BASE/grades/.jcfg"
for r in 1 2 3; do
  bl="$RUNS/$task/baseline/r$r/agent.diff"; ft="$RUNS/$task/$feat/r$r/agent.diff"
  [ -s "$bl" ] && [ -s "$ft" ] || continue
  # position-balanced: rep odd → baseline=A; rep even → feature=A
  if (( r % 2 )); then duel "$bl" "$ft" "r$r" ; A=baseline; else duel "$ft" "$bl" "r$r"; A=$feat; fi
  echo "$A" > "$out/r$r.Aslot"
done
```

- [ ] **Step 2: Commit**

```bash
git add bench/token-savers/judge.sh
git commit -m "eval(token-savers): blind position-balanced pairwise judge"
```

### Task 8: aggregate.mjs — RESULTS.md

**Files:**

- Create: `bench/token-savers/aggregate.mjs`

- [ ] **Step 1: Write aggregate.mjs**

Reads `runs/<task>/<arm>/r*/oracle.txt` (PASS/FAIL), `runs/.../result.json` (cost/usage), probe recall (compare agent output vs `tasks/probe/oracle.txt`), and judge winners (`grades/<task>/<feat>/r*.raw` + `.Aslot`). Emits a markdown matrix: per (task,arm) pass-rate + mean cost; per feature a pairwise win-rate vs baseline; probe recall for baseline/rtk/all; and a verdict line per feature (`NEUTRAL` if pass-rate ≥ baseline−1 cell and judge win-rate ≤ 55% for baseline, else `HURTS`). Concrete scoring:

```js
// recall: count oracle file:line tokens present in agent stdout
const oracle = fs.readFileSync("tasks/probe/oracle.txt", "utf8").trim().split("\n");
const found = oracle.filter((loc) => agentOut.includes(loc.split("—")[0].trim())).length;
const recall = found / oracle.length;
```

- [ ] **Step 2: Commit**

```bash
git add bench/token-savers/aggregate.mjs
git commit -m "eval(token-savers): aggregator -> RESULTS.md (pass-rate, win-rate, recall, verdict)"
```

---

## Phase 3 — Matrix runner + full run

### Task 9: run-matrix.sh with throttle + detach

**Files:**

- Create: `bench/token-savers/run-matrix.sh`

- [ ] **Step 1: Write run-matrix.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail; cd "$(dirname "$0")"; source lib.sh; source arms.sh; source tasks/manifest.sh
MAXP="${MAXP:-4}"   # throttle: max concurrent worktrees
launch(){ # <task> <arm> <rep> <sha> <goal> <testcmd>
  while [ "$(count_live_worktrees)" -ge "$MAXP" ]; do sleep 20; done
  TEST_CMD="$6" setsid bash run-cell.sh "$1" "$2" "$3" "$4" "$5" >>runs/matrix.log 2>&1 &
}
# feature tasks: all 5 arms
for t in "${FEATURE_TASKS[@]}"; do for a in "${ARMS[@]}"; do for r in 1 2 3; do
  launch "$t" "$a" "$r" "${TASK_SHA[$t]}" "${TASK_GOAL[$t]}" "${TASK_TEST[$t]}"
done; done; done
# rtk probe: baseline/rtk/all only, seeded worktree (TEST_CMD empty)
for a in baseline rtk all; do for r in 1 2 3; do
  launch probe "$a" "$r" HEAD tasks/goals/probe.md ""
done; done
wait; echo "MATRIX DONE"
```

(Probe cells need `seed.sh` run inside the worktree before the agent — add a `PROBE=1` branch in run-cell.sh that runs `tasks/probe/seed.sh "$wt"` right after `worktree_at`.)

- [ ] **Step 2: Add PROBE seeding branch to run-cell.sh**

In run-cell.sh after `worktree_at`:

```bash
[ "$task" = "probe" ] && bash "$(dirname "$0")/tasks/probe/seed.sh" "$wt" > "$cell/seed-oracle.txt"
```

- [ ] **Step 3: Dry-run 1 task only (pr-smallest), all 5 arms, n=1**

Run with a temporary single-rep, single-task loop; confirm 5 cells produce `result.json` + `agent.diff` + `oracle.txt`, no worktree leaks (`git worktree list`).

- [ ] **Step 4: Commit**

```bash
git add bench/token-savers/run-matrix.sh bench/token-savers/run-cell.sh
git commit -m "eval(token-savers): throttled detached matrix runner + probe seeding"
```

### Task 10: Launch full matrix under a watcher

- [ ] **Step 1: Launch in background with a re-invoking watcher (not cron)**

Run (background Bash tool):

```bash
cd /root/work/quantika-demo/bench/token-savers && nohup bash run-matrix.sh > runs/matrix.log 2>&1 &
echo "launched pid $!"
```

Monitor by tailing `runs/matrix.log` and `count_live_worktrees`; the watcher re-checks until `MATRIX DONE`.

- [ ] **Step 2: After completion, run judge for each feature arm × task**

```bash
for t in pr964 pr965 pr970; do for f in caveman rtk cavecrew all; do bash judge.sh "$t" "$f"; done; done
```

- [ ] **Step 3: Aggregate**

```bash
node aggregate.mjs > RESULTS.md && git add RESULTS.md && git commit -m "eval(token-savers): RESULTS — per-feature quality verdict"
```

- [ ] **Step 4: Ties → +n**

For any (feature) where pass-rate is within 1 cell of baseline AND judge is split (win-rate 45–55%), launch 2 more reps for that feature's tasks, re-judge, re-aggregate. Note in RESULTS.md.

---

## Phase 4 — Report + memory

### Task 11: Founder summary + memory note

- [ ] **Step 1: Write the human summary** (what hurts / what's neutral, with the rtk-probe recall numbers) into RESULTS.md top section.
- [ ] **Step 2: Save a memory** `project_quantika_token_savers_quality_eval_2026_06_14.md` with: verdict per feature, the committed harness path, any method deltas, link `[[feedback_model_bench_harness_method]]`. Add the MEMORY.md pointer line.
- [ ] **Step 3: Final commit + push branch**

```bash
git add -A && git commit -m "eval(token-savers): founder summary + memory"
git push -u origin eval/token-savers-quality
```

---

## Self-Review (done at plan-write time)

- **Spec coverage:** 5 arms (Task 2) ✓; 3 PR replays + oracle gate (Task 4) ✓; rtk probe (Task 5) ✓; triangulated scoring — objective (Task 6), pairwise (Task 7), probe recall (Task 8) ✓; confound controls — acceptEdits (Task 3 smoke gate), per-run clean cfg (lib/arms), isolated worktree at pre-SHA (run-cell), throttle by worktree count (Task 9), watcher-not-cron (Task 10) ✓; outputs RESULTS.md + memory (Tasks 8/11) ✓; cost from JSON (`usage_from_json`) ✓.
- **Placeholders:** the only `<...>` are per-PR SHAs/test-files that are DERIVED by the Task 4 gate (cannot be known until the gate runs) — Task 4 fills `manifest.sh` with the real values. This is a data-discovery step, not an unspecified implementation.
- **Consistency:** `make_cfg`/`arm_apply`/`worktree_at`/`count_live_worktrees`/`TEST_CMD`/`TASK_TEST` names match across lib.sh, arms.sh, run-cell.sh, run-matrix.sh.

## Known execution risks (carried from spec)

- **dev-LLM down** (gemini/bedrock) → any PR whose oracle tests call live LLM is disqualified at the Task 4 gate; substitute an offline-testable PR of the same class. The agents themselves are `claude --print` (unaffected).
- **`claude --print` nested auth** — runs under the VPS account's own credentials copied into the per-run cfg; if a cell dies on a terminal API error it yields an empty diff → counts as FAIL (filter and note, don't silently drop).
- **Cost creep on ties** — +n is bounded to one extra round of 2 reps per tied feature.
