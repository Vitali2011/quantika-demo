# Token-Savers Quality Eval — Phase 2 Report

**Branch:** eval/token-savers-quality  
**Date:** 2026-06-14  
**Scope:** Phase 2 (judge.sh + aggregate.mjs) + Phase 3 dry-run + matrix launch attempt

---

## STATUS: BLOCKED (credential corruption — see Q004 in QUESTIONS.md)

Phase 2 artifacts built and committed. Dry-run gate revealed a critical bug: `claude --print` with `CLAUDE_CONFIG_DIR` writes refreshed OAuth tokens back to the GLOBAL `~/.claude/.credentials.json`, corrupting it. Matrix cannot launch until restored.

---

## Phase 2 — Scoring Artifacts

### judge.sh (Task 7)
- **Commit:** `9fdfdb2`
- Blind pairwise judge: baseline vs feature diffs, position-balanced (odd rep → baseline=A, even → feature=A)
- Uses claude-sonnet-4-6 with minimal judge cfg (no skills/hooks)
- Output: `grades/<task>/<feat>/r{1,2,3}.raw` (A|B) + `.Aslot` (which arm is A)

### aggregate.mjs (Task 8)
- **Commit:** `47e8cd5`
- Reads: `runs/<task>/<arm>/r*/oracle.txt` (PASS/FAIL), `result.json` (cost/usage), probe agent stdout, `grades/*/r*.raw` + `.Aslot`
- Computes: oracle pass-rate, mean cost, judge win-rate vs baseline, probe recall, per-feature verdict
- Verdict: NEUTRAL if pass-rate within 1 cell of baseline AND judge win-rate ≤55%; HURTS otherwise

### run-matrix.sh (Task 9)
- **Commit:** `79f31e7` (base) + `adef341` (credential protection)
- 54 cells: 3 tasks × 5 arms × 3 reps = 45 + probe (3 arms × 3 reps = 9)
- Throttle: MAXP=4 concurrent worktrees
- setsid-detach: each cell runs detached via `TEST_CMD= setsid bash run-cell.sh ... &`
- Credential guard: `chmod 444 ~/.claude/.credentials.json` before cells + `trap cleanup EXIT`

### run-cell.sh fixes
- **Commit:** `adef341`
- Bug fixed: goal path resolved to absolute before subshell (`[[ "$goal" = /* ]] || goal="$BASE/$goal"`)
- lib.sh: daemon symlink added to cfg dir (helps if daemon running)

---

## Phase 3 Dry-Run Gate

### Outcome: PARTIAL — file structure OK, auth FAIL

Ran 1 cell: `pr965/baseline/r1`

| Artifact | Status |
|----------|--------|
| result.json | ✅ exists (787 bytes, auth-error JSON) |
| agent.diff | ✅ exists (0 bytes — agent made no changes due to 401) |
| oracle.txt | ✅ exists (FAIL — no changes made) |
| worktree leaks | ✅ NONE (clean) |

**Infrastructure check: PASS** — worktree lifecycle, cfg setup, oracle runner all work correctly.  
**Auth check: FAIL** — `claude --print` returned 401 in all configurations tested.

### Root cause: global credential corruption

1. `make_cfg` copies `~/.claude/.credentials.json` (471 bytes) to cell cfg
2. `claude --print` in cell runs, tries OAuth token refresh
3. CLI writes refreshed credentials back to GLOBAL `~/.claude/.credentials.json` (changes to 363 bytes)
4. Global credentials now invalid → all subsequent cells get 401
5. Valid backup exists: `/root/work/quantika-demo/bench/token-savers/runs/smoke/baseline/r1/.cfg/.credentials.json` (471 bytes)

### Fix required (manual, one-time)

```bash
# 1. Restore valid credentials from smoke backup
cp /root/work/quantika-demo/bench/token-savers/runs/smoke/baseline/r1/.cfg/.credentials.json \
   /root/.claude/.credentials.json

# 2. Verify
wc -c /root/.claude/.credentials.json  # expect 471

# 3. Launch matrix (from worktree)
cd /root/work/quantika-demo/.worktrees/token-savers-eval/bench/token-savers
REPO="$(dirname "$(dirname "$(pwd)")")" \
  nohup bash run-matrix.sh > runs/matrix.log 2>&1 &
echo "Matrix PID: $!" && echo "$!" > runs/matrix.pid
```

Note: `run-matrix.sh` now protects credentials with `chmod 444` trap, preventing future corruption.

---

## Commits on Branch (Phase 2)

```
adef341 eval(token-savers): fix goal-path resolution + daemon symlink in make_cfg
79f31e7 eval(token-savers): throttled detached matrix runner + probe seeding
47e8cd5 eval(token-savers): aggregator -> RESULTS.md (pass-rate, win-rate, recall, verdict)
9fdfdb2 eval(token-savers): blind position-balanced pairwise judge
```

---

## Next Session

1. User resolves Q004 (credential restore)  
2. Launch matrix: 54 cells, ~1.5h
3. After `MATRIX DONE` in matrix.log: run judge.sh for each task × feature arm
4. Run `node aggregate.mjs > RESULTS.md`
5. Phase 4: write summary + memory

---

## Known Issues

- **CLAUDE_CONFIG_DIR credential leak**: `claude --print` writes to global `~/.claude/.credentials.json` even when CLAUDE_CONFIG_DIR is set. `run-matrix.sh` now mitigates with chmod 444 guard. Upstream bug in claude CLI.
- **run-matrix.sh REPO env**: matrix must be launched with `REPO` pointing to the repo root (not the worktree root). The `run-matrix.sh` runs from `bench/token-savers/` relative to the repo; lib.sh uses `REPO=/root/work/quantika-demo` by default. If launching from the worktree, set `REPO=$(cd ../../..; pwd)`.
