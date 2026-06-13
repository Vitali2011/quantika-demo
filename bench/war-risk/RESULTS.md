# Model benchmark — war-risk PR replay (2026-06-13)

Orchestrator/model benchmark: replay the merged PR #957 (war-risk v2) task across model +
effort configurations, measuring **price / quality / speed** on identical, isolated runs.

- **Task (T1):** implement the three war-risk holes from the brief (`bench/war-risk/brief.md`):
  Д1 live JWC rate + fallback + provenance; Д2 tolerant memoized YAML loader; Д3 Suez-transit
  → `red-sea-hra` premium via the existing `route.viaCanal` field.
- **Start SHA:** `e242d259` (pre-#957, so the task is unsolved). Oracle ref: `a8e2e3ef` (#957).
- **Rig:** each run = one isolated `claude --print` in a throwaway git worktree at the start
  SHA, per-run `CLAUDE_CONFIG_DIR` (creds + `acceptEdits` only — no ambient skills), exact
  cost/duration from the run JSON. Configs × n=3.

## Configs (7) — cost / speed / quality

| Config     | model:effort                        | avg $ | avg min | Judge (1-10) | #957 obj | Value Q/$ |
| ---------- | ----------------------------------- | ----- | ------- | ------------ | -------- | --------- |
| opus-low   | opus-4-8:low                        | 2.52  | 6.5     | 7.7          | 6/12     | 3.05      |
| opus-med   | opus-4-8:medium                     | 2.99  | 8.5     | 8.7          | 7/12     | 2.90      |
| sonnet-max | sonnet-4-6:max                      | 2.52  | 15.3    | 7.3          | 6/12     | 2.92      |
| opus-high  | opus-4-8:high                       | 4.31  | 11.9    | 8.3          | 8/12     | 1.93      |
| opus-xhigh | opus-4-8:xhigh                      | 7.55  | 21.7    | 8.0          | 8/12     | 1.06      |
| opus-max   | opus-4-8:max                        | 7.29  | 22.4    | 8.3          | 8/12     | 1.14      |
| dynamic-wf | opus-4-8 implement→review (2 calls) | 8.29  | 22.5    | 8.7          | 8/12     | 1.04      |

Total spend: 21 solutions ≈ **$106**, grading (judge + pairwise) ≈ **$12** → ≈ **$118**.

## Quality oracles

1. **Blind solo judge** (opus-high, per solution) — scored Д1/Д2/Д3 + quality/scope/overall.
2. **#957 objective tests** — apply each diff at start SHA, overlay #957's real test files, run
   jest. Coarse (suites crash on module-name mismatch → partly couples to #957's API).
3. **Blind pairwise panel** (3 rep-matched A/B duels per contested pair, position-balanced).

## The pairwise panel overturned the solo-judge ranking

The solo judge ranked `opus-med` top (8.7) — **wrong**. Pairwise duels:

| Duel                   | Winner         | Score       |
| ---------------------- | -------------- | ----------- |
| opus-med vs opus-high  | **opus-high**  | 3/3         |
| opus-med vs dynamic-wf | **dynamic-wf** | 3/3         |
| opus-high vs opus-max  | opus-max       | 2/3 (close) |

**Root cause:** changing the war-risk rate (0.075% → live ~0.2–0.75%) changes computed premiums,
and the repo has pre-existing tests with hardcoded premium assertions (hydrate-demo-session,
regression/demo, GoG). They must be updated or they go red. `opus-med` wrote its own code but
left those **downstream tests red** — a corner the solo judge couldn't see (it judged the diff
in isolation). `opus-high` / `opus-max` / `dynamic-wf` updated the full blast radius.

All three signals then agree: #957-objective (med 7/12 < high/max 8/12), pairwise (med loses
3/3 to both), and the solo 8.7 was the outlier (blind to cross-file consequences).

## Verdict

- **Best value: `opus-high`** ($4.31) — handles the full blast radius (what cheaper configs
  miss), beats `opus-med` 3/3, and loses to `opus-max` only 2/3 at 1.7× less cost.
- **`opus-max` / `opus-xhigh`** — marginally more complete than high, big price; `xhigh` ≈ `max`
  in cost/time (not "between high and max" as expected).
- **`dynamic-wf`** — orchestration's review stage genuinely catches regressions a single shot
  drops (vindicated), but `opus-high` reaches ~the same outcome for less money.
- **`opus-med`** — looks best in isolation, but **silently leaves the repo's tests red**. Trap.
- **`opus-low` / `sonnet-max`** — fast/cheap, roughest on correctness (`sonnet-max` Suez gaps).

## Meta-lessons

- **Solo absolute scoring is blind to blast radius**; pairwise comparison surfaces it. Panel paid off.
- **"Run it" beats review:** the harness itself had two silent validity bugs (below) that spec
  review + unit tests missed; only real runs revealed them.

## Harness validity bugs found & fixed (don't repeat)

1. **`defaultMode: "auto"` is not a real permission mode** → silently falls back to "default" →
   non-interactive `--print` auto-DENIES every Edit/Write → agents read code, write nothing,
   emit prose. Fix: `acceptEdits` (+ `--permission-mode acceptEdits`).
2. **One shared `CLAUDE_CONFIG_DIR` across concurrent runs corrupts session/permission state.**
   Fix: per-run config dir under each result dir.
3. Matrix throttle: `running()` must count live worktrees, not `pgrep run-arm.sh` (each arm has a
   same-cmdline subshell → double-count → MAX_PAR silently halved).
4. Never restart/kill the matrix while arms run — tmux teardown SIGHUPs the arms' claude (handler
   reset by node → dies) → poisoned 0-row runs. `setsid`-detach arms; only restart when idle.

Artifacts: `bench/war-risk/results/<config>/r<n>/{solution.diff,usage.tsv}`,
`bench/war-risk/grades/<config>/r<n>/{scores.json,h957.summary}`, `grades/_pairs/`.
Scripts: `scripts/bench/{run-arm,run-matrix,run-wf-arm,judge-arm,judge-matrix,grade-957,grade-957-matrix,judge-pair,pair-matrix}.sh`.
