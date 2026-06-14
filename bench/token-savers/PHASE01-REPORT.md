# Token-Savers Quality Eval — Phase 0 + Phase 1 Report

**Branch:** eval/token-savers-quality  
**Date:** 2026-06-14  
**Scope:** Phase 0 (harness scaffold + smoke gate) + Phase 1 (oracle validation + rtk probe)

---

## STATUS: PASS

All Phase 0 and Phase 1 tasks complete. Harness committed and ready for Phase 3 matrix run.

---

## Phase 0 — Harness Scaffold

### Task 1: bench/token-savers scaffold (lib.sh + .gitignore)
- **Result:** PASS
- `bench/token-savers/lib.sh` — helpers: `make_cfg`, `worktree_at`, `count_live_worktrees`, `usage_from_json`
- `bench/token-savers/.gitignore` — ignores `runs/`, `grades/`, `*.log`, `*.tmp`
- Commit: `64ba2fd5`

### Task 2: arms.sh — 5 arm definitions
- **Result:** PASS
- Arms: `baseline`, `caveman`, `rtk`, `cavecrew`, `all`
- **Deviation from plan:** `rtk init -g` does NOT respect `CLAUDE_CONFIG_DIR` — it writes to `~/.claude/settings.json` globally. Fixed by directly injecting the rtk PreToolUse hook into per-run `$cfg/settings.json`:
  ```json
  {"defaultMode":"acceptEdits","hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}]}}
  ```
- Smoke: `grep -q rtk "$d/settings.json"` → **RTK HOOK OK**
- Commit: `cec955d2`

### Task 3: run-cell.sh + baseline smoke
- **Result:** PASS — DIFF PRODUCED + non-empty result.json
- Smoke goal: add `<!-- eval-smoke -->` to README.md at HEAD
- `agent.diff`: 314 bytes (non-empty)
- `result.json` usage: `total_cost_usd=0.091`, `input_tokens=5`, `cache_read_input_tokens=71559`, `output_tokens=306`
- Phase-0 gate: **PASSED**
- Commit: `0804bca0`

---

## Phase 1 — Oracle Validation

### Task 4: 3 PR oracles validated

All 3 oracles are offline-runnable (no live gemini/bedrock calls). All confirm pre/merge flip.

| PR | Merge SHA | Pre-SHA | Test File | Pre (FAIL) | Merge (PASS) |
|----|-----------|---------|-----------|------------|--------------|
| #964 write-paths | e9070fe2 | 0bb8dc04 | `lib/matching/__tests__/write-path-field-parity.test.ts` | file absent → FAIL | PASS (1 suite) |
| #965 engine-C | 40966379 | e9070fe2 | `lib/matching/__tests__/matches-item-uniqueness.test.ts` | file absent → FAIL | PASS (4 tests) |
| #970 wave-D | 1a79b6c5 | 7499056d | `lib/__tests__/parse-vessel-lastcargoes.test.ts` | file absent → FAIL | PASS (5 tests) |

**No substitutions required.** All 3 original PRs had offline-runnable tests that flip pre→merge.

**Dev-LLM gate:** All selected tests stub/mock LLM boundaries or are pure data-processing (parsing, SQLite, arithmetic). Confirmed offline with symlinked node_modules.

**manifest.sh** populated with real pre-SHAs and test commands (including `ln -sf` to reuse main repo node_modules and `--forceExit` per project memory).

Commit: `246336d7`

### Task 5: rtk diagnostic probe

- **seed.sh smoke:** 5 `file:line` lines produced:
  ```
  docs/SEED_A.md:1
  docs/SEED_B.md:1
  docs/SEED_C.md:1
  docs/SEED_D.md:1
  docs/SEED_E.md:1
  ```
- **oracle.txt:** 5 entries matching the seeded locations
- **probe.md:** "Audit every file under docs/ for stale, wrong, or self-contradictory directives. Output ONE line per issue as `path:line — <why>`."
- Commit: `5807f100`

---

## Harness File Map

```
bench/token-savers/
  .gitignore                    # ignores runs/, grades/, *.log, *.tmp
  lib.sh                        # shared helpers
  arms.sh                       # 5 arm definitions + _install_rtk_hook fix
  run-cell.sh                   # single-cell runner (worktree + cfg + claude --print)
  tasks/
    manifest.sh                 # 3 PR oracles with real SHAs + test commands
    goals/
      pr964.md                  # write-paths convergence goal
      pr965.md                  # engine wave C goal
      pr970.md                  # wave D goal
      probe.md                  # rtk diagnostic probe goal
    probe/
      seed.sh                   # plants 5 docs issues in worktree
      oracle.txt                # expected file:line locations (5 entries)
  PHASE01-REPORT.md             # this file
```

---

## Known Issues / Blockers

None. Ready for Phase 3 matrix launch.

**Next step (Phase 3, out of scope for this session):** `run-matrix.sh` — throttled 54-session matrix across 5 arms × 3 tasks × 3 reps. Requires Phase 2 artifacts (judge.sh, aggregate.mjs) which are not part of Phase 0/1 scope.

---

## Commits on Branch (Phase 0+1)

```
5807f100 eval(token-savers): rtk diagnostic probe (5 seeded issues + oracle)
246336d7 eval(token-savers): pin 3 PR oracles (validated offline + pre/merge flip)
0804bca0 eval(token-savers): single-cell runner + verified non-empty diff
cec955d2 eval(token-savers): arm definitions (baseline/caveman/rtk/cavecrew/all)
64ba2fd5 eval(token-savers): rig scaffold + lib.sh helpers
```
