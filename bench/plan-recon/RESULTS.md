# Plan + Recon role eval — Results (2026-06-13)

Spec: `docs/superpowers/specs/2026-06-13-orchestrator-day-plan-recon-eval-design.md`
Plan: `docs/superpowers/plans/2026-06-13-plan-recon-eval.md`
Rig: war-risk bench, generalized with `BENCH_DIR`/`BENCH_SHA` (`scripts/bench/`). n=2 (founder call).
Account: Marychenka (dev-VPS). Total spend ≈ **$55** (recon ~$14 + plan ~$32 + ~$7 discarded race
runs + ~$1.6 judging) — under the n=2 estimate.

## TL;DR — decisions

| Role                 | Was               | Verdict                                                          | Move                 |
| -------------------- | ----------------- | ---------------------------------------------------------------- | -------------------- |
| **Разведка (recon)** | Sonnet 4.6 : high | Sonnet:high = floor: ties Opus, but Sonnet low/med drop the root | **KEEP Sonnet:high** |
| **План (plan)**      | Opus 4.8 : medium | medium drops tests; high = max at lower cost                     | **medium → high**    |

`max` for plan is **rejected**: same test outcome as high, but ~30% dearer and ~40% slower per run.

## Part A — Recon (judge-against-known-root, root /2 + location /1)

2 tasks (#976 capacity unit-misread, #975 deeplink stale-id). Run in two passes: first 4 configs
(Sonnet:high + Opus low/med/high), then — after Sonnet:high tied Opus at the cheapest price — the
**full Sonnet effort curve** (low/med/max) to find the floor. 7 configs × 2 tasks × n=2 = 28
read-only runs.

| Config                | root (mean /2) | location (/1) | $/run (avg) |
| --------------------- | -------------- | ------------- | ----------- |
| Sonnet 4.6 : low      | 1.50           | 1.00          | $0.29       |
| Sonnet 4.6 : med      | 1.75           | 1.00          | $0.37       |
| **Sonnet 4.6 : high** | **2.00**       | 1.00          | **$0.59**   |
| Sonnet 4.6 : max      | 2.00           | 1.00          | $0.77       |
| Opus 4.8 : low        | 2.00           | 1.00          | $0.70       |
| Opus 4.8 : medium     | 2.00           | 1.00          | $0.67       |
| Opus 4.8 : high       | 2.00           | 1.00          | $1.56       |

**The Sonnet effort curve broke the ceiling — downward.** Every Opus config and Sonnet:high/max scored
a perfect 2.00, but **Sonnet:low (1.50) and Sonnet:med (1.75) start missing the root cause**. So
Sonnet:high is not an arbitrary pick — it's the **floor** for clean root-finding on these tasks: the
cheapest effort that still nails the root every time. Below it, quality degrades; above it (max, and
all of Opus), zero gain. Calibration verified by hand: even Opus:low's #976 analysis named the precise
mechanism (cbft read as cbm, ~35.3× factor, why only the cbft-sourced ~17 vessels, and that the
existing plausibility guard only nulls _small_ values — i.e. it derived the actual shipped fix). The
2/2 is earned, not a rubber-stamp.

**Read:** Sonnet:high is the sweet spot for recon, confirmed on two fronts — (1) it is **not weak**
(ties every Opus config), refuting the founder's worry; (2) it is the **cheapest effort that holds**
(low/med drop the root, max/Opus add nothing). Keep Sonnet:high; do not downgrade to med/low, do not
spend Opus money. $0.59/run × 3 read-only recon passes/orchestrator-day.

**Caveat (ceiling at the top):** the 2.00 cluster (Sonnet:high/max + all Opus) still can't be
separated — these two tasks don't prove Opus is no better on _genuinely harder_ root-finding. What the
curve now _does_ prove (which the first pass could not) is the lower bound: high is the floor, not
overkill. A harder recon set could test the top; no reason to spend on that for now.

## Part B — Plan (downstream: plan → fixed Opus:high executor → #957 jest oracle, /4)

1 task (war-risk #957), fixed executor `Opus:high` for all arms, 3 plan-configs × n=2.

| Plan config       | #957 passed (mean /4) | r1  | r2  | $/run (plan+exec) | Stage-1 wall (avg) |
| ----------------- | --------------------- | --- | --- | ----------------- | ------------------ |
| Opus 4.8 : medium | 3.50                  | 3/4 | 4/4 | ~$4.32            | ~7.4 min           |
| Opus 4.8 : high   | **4.00**              | 4/4 | 4/4 | ~$5.06            | ~8.8 min           |
| Opus 4.8 : max    | 4.00                  | 4/4 | 4/4 | ~$6.66            | ~13.4 min          |

**Read:** medium occasionally leaves a test red (3.5 avg); high gets full marks; max matches high but
costs ~30% more and runs ~40% longer in plan generation. So **high is the sweet spot** for the plan
role — move medium → high; do **not** go to max (no quality gain on this task, strictly more expensive
and slower).

**Caveat (ceiling effect):** the #957 oracle has only 4 test cases, and both high and max maxed out
(4/4) → high-vs-max is indistinguishable here, n=2, single task. The medium→high gap rests on one
dropped test. The conclusion is directional (enough to answer "medium too low? → yes, go high; max
worth it? → no"), not a published law.

## Validity sweep (per spec guards)

- ✅ Recon: 16/16 `recon.txt` non-empty; 0 hit the worktree-deletion race (read-only single-worktree
  runs are not exposed to it).
- ✅ Plan: all 6 runs produced a non-empty Stage-2 diff and a graded #957 summary.
- ✅ Executor held constant: every plan Stage-2 ran `claude-opus-4-8 --effort high` by construction.
- ✅ Judge calibration spot-checked by hand (Opus:low + Sonnet:high #976) — 2/2 earned.

## Harness lesson — git-worktree concurrency race

The first plan wave (`MAX_PAR=2`) lost **2/6** runs: each plan run juggles three worktrees (Stage-1
plan-gen, Stage-2 executor, grade-957), and concurrent `git worktree add/remove` is not safe — a
parallel run deleted another's cwd mid-task (the agent literally reported "working directory was
deleted mid-task", producing an empty plan/diff). Fix shipped: `run-plan-matrix.sh` defaults to
`MAX_PAR=1` (serial); the 2 lost runs were re-run serially and both completed clean. Recon was
unaffected (one worktree per run). A future parallel-safe option would be an flock around
`new-run-worktree.sh`.
