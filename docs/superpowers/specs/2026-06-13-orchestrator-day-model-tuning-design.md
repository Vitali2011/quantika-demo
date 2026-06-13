# orchestrator-day model tuning — design (2026-06-13)

**Goal:** tune the per-role model+effort assignments in the `orchestrator-day` skill so dispatched
work is higher quality without overpaying, starting with the role we have data for (execution).

**Evidence:** the war-risk model benchmark (`bench/war-risk/RESULTS.md`, PR #981) measured the
**execution** role across 7 configs × n=3. Findings that drive this design:

- `sonnet-max` was the **weakest** config (judge 7.3, Suez/d3 gaps) — Sonnet is too weak for M/L execution even at max effort.
- `opus-high` is the **value sweet spot**: handles the full blast radius (updates the pre-existing
  tests a rate change breaks — the corner cheaper configs cut), beats `opus-med` 3/3 head-to-head,
  and loses to `opus-max` only 2/3 at ~40% less cost.
- `opus-med` looks top in isolation but **silently leaves repo tests red** — unsafe for execution.
- Dear effort/orchestration (`xhigh`≈`max`, `dynamic-wf`) does not pay on this (well-specified) task.

## Current state — orchestrator-day role matrix (SKILL.md)

| Role                                        | Model      | Effort |
| ------------------------------------------- | ---------- | ------ |
| Разведка (3 read-only recon)                | Sonnet 4.6 | high   |
| План                                        | Opus 4.8   | medium |
| Исполнение M/L                              | Sonnet 4.6 | max    |
| Тривиальная правка                          | Sonnet 4.6 | high   |
| Тяжёлое исполнение (recursive-bugs, fix-R2) | Opus 4.8   | medium |

`dispatch.sh` default worker = `claude-sonnet-4-6`, `DISPATCH_EFFORT=max`.

## Decisions (this brainstorm)

- **Scope = A:** act on execution now from data; analysis + plan get separate, lighter evals later.
- **Sequencing = 3:** ship the execution change now **and** run one hard-task benchmark in parallel
  to tune the heavy-execution escalation rule.
- **Change shape = A (surgical):** move only the proven-weak M/L execution row; leave cheap/trivial
  on Sonnet; touch only the M/L dispatch path.

---

## Part 1 — Execution model change (implement now)

Edits in `~/.claude/skills/orchestrator-day/`:

1. **SKILL.md matrix:**
   - `Исполнение M/L`: `Sonnet 4.6 : max` → **`Opus 4.8 : high`**.
   - `Тяжёлое исполнение`: `Opus 4.8 : medium` → **`Opus 4.8 : max`** (interim; Part 2 tunes it).
   - `Тривиальная правка`: **unchanged** (`Sonnet 4.6 : high`).
   - `Разведка`, `План`: **unchanged** (handled later / by Part 3).
   - Update the prose on the same lines (l.42, l.48) that say "Исполнение (Sonnet …)".

2. **Per-role selection — make it matrix-driven, not default-driven:** the authoritative source is
   the SKILL.md matrix (the orchestrator passes `DISPATCH_MODEL`/`DISPATCH_EFFORT` per role when it
   calls `dispatch.sh`). So the primary change is: the orchestrator passes
   `DISPATCH_MODEL=claude-opus-4-8 DISPATCH_EFFORT=high` for **M/L execution** dispatches (update
   `references/dispatch-protocol.md` examples + the matrix prose accordingly).
   - **`dispatch.sh` default:** first read it during planning. If the M/L path relies on the
     **default** (rather than an explicit per-call env), then trivial/routines must rely on it too —
     flipping the default would hit them. In that case do NOT flip the default; instead make M/L
     callers pass explicit env. Only change `dispatch.sh`'s default if M/L is the sole consumer of it.
   - Keep the env override knobs so any caller can still force Sonnet/other.

3. **`references/subagent-prompt-template.md`:** the "Ты — Sonnet 4.6 subagent" framing → make it
   model-agnostic or Opus for the M/L execution template (don't hardcode Sonnet where Opus now runs).

4. **Memory:** update `feedback_dispatch_effort_max_default_v3_17_0` (default for M/L is now Opus:high,
   not Sonnet:max) and add a pointer to the benchmark evidence.

**Out of scope (unchanged):** recon model, plan model, trivial-fix model, routines, the
post-deploy fix-loop (R1 Sonnet / R2 Opus already escalates).

**Verification:** skill still loads; `evals/two-session-evals.json` trigger-tests still pass; grep
confirms no M/L execution path still hardcodes Sonnet. This is a config/doc change backed by the
benchmark — not a RED-GREEN behavioral-rule change.

## Part 2 — Hard-task benchmark (parallel; tunes escalation)

- **Task:** one large, cross-cutting, under-specified, **code-only** (no runtime LLM — dev-LLM is
  down) merged PR of this repo with an oracle (#970-class, ~2000 LOC). **Selection shown to the
  founder before any spend.**
- **Configs:** `opus-med`, `opus-high`, `opus-max`, `dynamic-wf` × n=3 (12 runs, ≈$150–200).
- **Rig:** identical to war-risk (isolated `--print` per run at the pre-PR SHA, `acceptEdits`,
  per-run config dir). Grading: blind solo judge + objective hidden-test oracle + pairwise on contested.
- **Output:** confirms whether `opus-high` holds as the base on a hard task, and sets the
  `Тяжёлое исполнение` escalation target (high vs max vs orchestration).

## Part 3 — Analysis + Plan evals (future, sketched only)

No objective oracle (a recon or a plan cannot be run through jest). Proposed method = **downstream
outcome**:

- **Analysis (recon):** "good recon finds the **root cause**, not a symptom." Use a set of repo bugs
  with known root causes; run `Sonnet:high` vs `Opus:{med,high}` recon; score whether the root was
  identified. Judge-assisted.
- **Plan:** "a good plan is one execution succeeds from." Score by whether a fixed executor, given
  the plan, produces passing code — or judge plan completeness/correctness against the known PR.

Deferred to a separate spec. Recorded here only to fix the intended approach.

## Risks

- Execution cost rises (~+71%/run on the highest-volume role); accepted because Sonnet is proven too
  weak there. Trivial/routines stay cheap to bound the increase.
- Easy-task evidence may not fully transfer to hard tasks → Part 2 validates before the escalation
  rule is finalized.
- orchestrator-day skill repo is separate (and per memory often uncommitted) — implementation must
  commit the skill change there, not only in quantika-demo.
