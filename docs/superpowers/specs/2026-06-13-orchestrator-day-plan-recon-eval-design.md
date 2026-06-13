# orchestrator-day — Plan + Recon role eval (Part 3) — Design

**Date:** 2026-06-13
**Status:** design, awaiting founder review
**Parent:** `2026-06-13-orchestrator-day-model-tuning-design.md` (Part 3, was deferred — now live)
**Predecessor rig:** war-risk model benchmark (`bench/war-risk/`, PR #981, `RESULTS.md`)

## Goal

Measure which model+effort fits the **Разведка (recon)** and **План (plan)** roles in the
orchestrator-day matrix, so those two rows are evidence-backed like the execution row already is.

Two open founder questions this answers:

1. **Recon:** is `Sonnet:high` (current) too weak for code analysis / root-finding?
2. **Plan:** is `Opus:medium` (current) enough, or should the plan role be `high`/`max`?

## Why this is harder than the execution benchmark

The war-risk execution benchmark had an **objective oracle** — jest. Run the model's diff through
hidden tests; pass/fail is the answer, no argument. **Recon and plan have no such oracle**: a recon
output and a plan are judgment artifacts, you cannot run them through jest directly. So the central
risk is not money — it is a **garbage grade**: spend $100 and learn nothing if the scoring method is
weak. The method below is chosen per role to maximize signal-per-dollar (founder decision: hybrid).

## Part A — Recon eval (judge-against-known-root)

A recon's job (per the skill: `systematic-debugging` Ph1-3, **КОРЕНЬ не симптом**) is to name the
**root cause**. Recent fix-PRs give us a gold answer: the true root is documented.

- **Method:** feed the model **only the symptom** (what QA/the user observed), the repo at the
  **pre-fix SHA**, read-only (recon does not edit). The model returns a root-cause analysis.
- **Tasks (2):**
  - **#976** capacity-clamp. Symptom: ~17 vessels show absurd capacity (~30× DWT). True root:
    unit-less `G/B 220.577` in the email read as cbm when it is **cbft** (~30× inflation).
  - **#975** deeplink-404. Symptom: detail deeplinks 404 after session rehydrate. True root:
    numeric **session-scoped match-id stales** after rehydrate (other routes use stable gmail-id).
- **Configs (4):** `Sonnet:high` (current baseline) · `Opus:low` · `Opus:medium` · `Opus:high`.
- **n = 3** per config per task → 4 × 3 × 2 = **24 read-only runs**.
- **Grading:** blind judge gets `{model recon output, documented true root}` and scores
  **root-found / symptom-only / wrong** (3-point). Pairwise A/B on contested configs (position-bias
  alternation by run parity, as in war-risk). The judge never sees which config produced which output.
- **Validity guards:**
  - Prompt carries **only the symptom** — never the fix, the fixed file path, or the PR. Leak = void.
  - Run is read-only (plan permission-mode or no-edit settings) — recon must not mutate the worktree.
  - A run is **valid** only if the output names a concrete root (non-empty, not "need more info").

## Part B — Plan eval (downstream executor → jest)

A plan's whole point is that correct code can be built from it. So measure that **objectively**:
chain the plan to a fixed executor and run the hidden tests.

- **Method (2 stages):**
  - **Stage 1 (measured):** the plan-config reads the repo at the **pre-PR SHA** + the task brief and
    produces an implementation plan (writing-plans style). This is the only stage that varies.
  - **Stage 2 (held constant):** a **fixed executor — `Opus:high`** — takes that plan and implements
    it. Identical executor config across all plan-configs, so differences trace to the **plan**, not
    the executor. `n=3` averages executor variance.
  - **Score:** run the hidden tests; count tests passed (objective, via the existing oracle).
- **Task (1):** **war-risk #957** — it already has the full oracle from the previous benchmark
  (`bench/war-risk/grade-957.sh`, the 3 test files at oracle SHA `a8e2e3ef`, `brief.md`, pre-SHA
  `e242d259`). **The plan-eval rig is therefore ~built** — Stage 2 + grading is the war-risk
  execution rig unchanged; only Stage 1 (plan generation) is new.
- **Configs (3):** `Opus:medium` (current baseline) · `Opus:high` · `Opus:max`.
- **n = 3** per config → 3 × 3 = 9 plan runs + 9 executor runs.
- **Grading:** objective (jest pass-count via `grade-957.sh`). Pairwise judge only as a tiebreaker
  if two configs land within executor-variance of each other on the pass-count.
- **Validity guards:**
  - Stage-2 executor config is **byte-identical** across arms (only the input plan differs).
  - A plan run is **valid** only if Stage 1 emitted a real multi-step plan (not a refusal/prose stub)
    **and** Stage 2 produced a non-empty diff. Empty diff = void (the war-risk `defaultMode:"auto"`
    bug — agents emitting prose instead of edits — must not recur; use `acceptEdits` for Stage 2).

## Rig (reused from war-risk)

- Isolated git worktree per run at the pre-fix / pre-PR SHA; per-run `CLAUDE_CONFIG_DIR` (copied
  creds + minimal `settings.json`); on dev-VPS; `setsid nohup` detached arms (immune to scheduler
  SIGHUP); one `usage.tsv` row per run (cost/duration/tokens from `--output-format json`).
- Recon stage: read-only. Plan Stage-2: `acceptEdits` + `--permission-mode acceptEdits`.
- Scripts: `run-arm.sh` (recon + plan-stage-1, parameterized by `BENCH_BRIEF`/`BENCH_PERM`),
  `grade-957.sh` (plan oracle, reused), `judge-arm.sh` + `pair-matrix.sh` (reused) + **one new
  `judge-root.sh`** (root-match 3-point judge for recon).

## Cost

- Recon: 24 read-only runs (one-shot, cheap) + grading ≈ **$50–65**.
- Plan: 9 plan + 9 executor runs on #957 + jest (free) + tiebreak judge ≈ **$90–100**.
- **Total ≈ $140–165.** Trim knobs: recon → 1 task or n=2 (−~$25); plan → n=2 (−~$30). Justified
  because recon+plan run on **every** task (unlike the rare heavy-execution tier that was not worth
  benching) — high frequency = high leverage.

## Output → what it tunes

- **Recon row** (`Разведка | Sonnet 4.6 | high`): keep Sonnet, or move to Opus low/med/high if Sonnet
  measurably misses roots. Watch specifically whether `Opus:low` matches higher efforts at lower cost.
- **Plan row** (`План | Opus 4.8 | medium`): keep medium, or raise to high/max if a richer plan yields
  more passing tests downstream.

Results land in `bench/plan-recon/RESULTS.md` + a memory update + the two matrix rows (if they move).

## Risks

- **No-oracle noise (recon):** mitigated by a crisp documented root + blind judge + pairwise. Residual
  judge subjectivity remains — report it, do not over-claim a 1-point gap.
- **Executor-variance confound (plan):** mitigated by fixed executor + n=3. If pass-counts cluster
  within variance, report "no measurable difference" rather than crowning a winner.
- **Symptom-leak (recon):** the single biggest validity threat — a leaked fix makes every config look
  good. Brief authored from the **issue/symptom side only**, reviewed before any run.
- **Small task set:** 2 recon tasks + 1 plan task is thin. Conclusions are directional, not final;
  enough to answer the two yes/no founder questions, not to publish a law.
