# Token-Savers Quality Eval — Design

- **Date:** 2026-06-14
- **Status:** Approved (founder), ready for plan
- **Author:** orchestrator session (MacBook)
- **Related:** memory `feedback_model_bench_harness_method`, `project_quantika_model_benchmark_2026_06_13`; harness `scripts/bench/`

## Question

Do the three token-saving features used around `/orchestrator-day` degrade **coding quality**?

- **caveman** — terse output style on the coding agent
- **rtk** — compresses noisy command output (global hook = auto-compress everything)
- **cavecrew** — compressed sub-agent delegation (investigator / builder / reviewer)

The founder's concern: turning these ON to save tokens might make the produced code worse. This eval isolates each feature and measures quality impact against an objective oracle.

## Non-goals

- Not a token-savings measurement (already done: RTK ~46–77%, caveman ~66% — separate session).
- Not a model/effort benchmark (the model is held constant; the variable is the saver).
- Not testing the full Mac-orchestrator → VPS-worker dispatch chain (cannot be cleanly A/B'd). We test the **code-writing agent**, which is where the savers bite.

## Unit under test

One **solo coding agent** (`claude --print`) that receives a task and writes a diff, run on the isolated dev-VPS bench rig. Each feature is toggled ON _for that agent_. This directly answers "if a coding agent uses saver X, does its code get worse?" — isolated, one factor at a time.

## Arms (5)

| arm        | what is enabled      | activation mechanic                                                                                                   |
| ---------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `baseline` | nothing              | clean per-run config dir, no ambient skills                                                                           |
| `caveman`  | caveman terse mode   | inject caveman directive via `--append-system-prompt` (the SessionStart hook does not fire in a clean config dir)     |
| `rtk`      | global rtk hook      | `rtk init -g` into the arm's config dir → auto-compress ALL bash output (the documented-risk mode)                    |
| `cavecrew` | sub-agent delegation | caveman plugin present in arm config; agent permitted/encouraged to delegate locate+review to `cavecrew-*` sub-agents |
| `all`      | all three            | caveman directive + rtk hook + cavecrew plugin together (the real "savers ON")                                        |

**Calibration hypothesis:** caveman exempts code blocks by its own rule → its effect on _code_ may be ~zero (effect, if any, lands on reasoning). The features with a real prior for harm are **rtk** (documented blindness to `file:line`) and **cavecrew** (detail loss across compressed hand-off).

## Task corpus

### Feature-implement tasks (3 diverse real merged PRs)

Replayed at `pre-SHA = first parent of the PR's merge commit`. The agent is given the PR's goal/issue text; the **oracle** is the test subset that the PR touched, run against the agent's diff.

| class                  | PR   | merge commit |
| ---------------------- | ---- | ------------ |
| data / write-path      | #964 | `e9070fe2`   |
| engine logic / compute | #965 | `40966379`   |
| UI / feature-wiring    | #970 | `1a79b6c5`   |

Selection rule (applied at execution): each PR must have a runnable test subset that **passes at merge and fails at pre-SHA** (a valid oracle). If a chosen PR lacks this or is too large for a single coherent replay, the plan substitutes the nearest recent PR of the same class and scopes to its primary sub-goal + matching tests. Substitutions are logged in `RESULTS.md`.

### rtk diagnostic probe (1 synthetic task)

Mirrors the documented 2026-06-11 failure (rtk-agent reported "no problems" where raw output had 5 real stale directives). Seed **N=5** known issues into a code snapshot; task = "audit <target>, list every problem with exact `file:line`"; oracle = the 5 seeded locations. Metric = **recall** (fraction of seeded issues found) + precision. Run on `baseline / rtk / all` only (3 arms) — the probe exists to test the rtk-blinding mechanism, not caveman/cavecrew.

## Oracles & metrics (triangulation)

A solo judge is blind to cross-file blast radius (memory: it compresses to ~all-3s and misses that a diff breaks other tests). Triangulate three signals:

1. **Objective tests (primary):** run the PR's test subset on the agent's diff → pass/fail. The main quality signal.
2. **Blind pairwise judge:** `baseline` diff vs feature diff, **position-balanced**, majority of n. Surfaces a systematic quality loss the binary test pass can miss. The judge does not know which arm is which.
3. **rtk probe:** recall/precision against seeded locations.

**Pass criterion ("feature does NOT hurt quality"):** for each feature, its test pass-rate is **not worse than baseline beyond noise** AND the blind judge shows **no systematic preference for baseline**. For rtk additionally: probe recall not materially below baseline.

## Confound controls / known traps (from `feedback_model_bench_harness_method`)

- **Model held constant:** Sonnet-4.6 across all arms (= default dispatched worker). The only variable is the saver.
- **Permission trap:** `--permission-mode acceptEdits` (NOT `defaultMode:"auto"`, which silently auto-denies every Edit in `--print` → empty diff).
- **Concurrency trap:** per-run `CLAUDE_CONFIG_DIR` (creds + settings only). Baseline/caveman/rtk configs carry **no** ambient skills (else superpowers hijacks the agent into writing a PLAN instead of code). cavecrew/all configs carry only the caveman plugin.
- **Isolation:** each run = throwaway `git worktree` at the fixed pre-SHA; exact cost/duration from `--output-format json`.
- **Throttle** by live-worktree count (not `pgrep`, which double-counts subshells); `setsid`-detach arms; never restart the matrix while arms run.
- **Monitoring:** background-Bash watchers (re-invoke on exit), not session cron (fires only on idle ticks).

## Matrix & cost

- Feature tasks: 5 arms × 3 PRs × n=3 = **45 sessions**
- rtk probe: 3 arms × n=3 = **9 sessions**
- **Total ≈ 54 sessions**, Sonnet-4.6 coding runs ≈ **$10–20** (rough; exact from JSON usage post-run).
- n bumped on ties (judge split or pass-rate within noise) per arm/task.

## Outputs

- `bench/token-savers/RESULTS.md` — matrix (arm × task: test pass-rate, pairwise win-rate, probe recall), per-feature verdict (hurts / neutral), cost/duration, any PR substitutions.
- Raw per-run JSON + diffs retained under `bench/token-savers/runs/`.
- A memory note capturing the verdict + method deltas.

## Risks / limitations

- **Synthetic probe ≠ field rtk use** — it deliberately targets the worst case; report it as "rtk-blinding risk under auto-hook," not "rtk always harmful."
- **n=3 is coarse** — detects gross regressions, not subtle ones. Ties trigger more reps, not a stronger claim.
- **caveman in `--print`** is injected via system-prompt, not the real SessionStart hook — close but not identical to interactive use; noted as a caveat.
- **3 PRs ≠ full code distribution** — covers data/logic/UI classes, not exhaustive.
