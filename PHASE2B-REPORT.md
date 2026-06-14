# Phase 2B Report — credfix + matrix launch

**Date**: 2026-06-14  
**Branch**: eval/token-savers-quality  
**Commit**: 46a92af9

## Root Cause (Q004)

`claude --print` with `CLAUDE_CONFIG_DIR` still writes OAuth token refresh-backs to `$HOME/.claude/.credentials.json` (HOME-based, not CLAUDE_CONFIG_DIR-based). When 54 matrix cells ran concurrently with the same HOME, they raced to write stale auth tokens to global creds, corrupting it (471→363 bytes, expired refresh token).

## Fix Applied

### `bench/token-savers/run-cell.sh`
Per-cell HOME isolation: each cell creates `$cell/home/.claude/` with a copy of known-valid credentials, then runs claude with `HOME="$cell/home"`. Any OAuth write-back lands in the cell sandbox, never in global `~/.claude/.credentials.json`.

```bash
KNOWN_CREDS="${KNOWN_CREDS:-$BASE/runs/smoke/baseline/r1/.cfg/.credentials.json}"
[ ! -f "$KNOWN_CREDS" ] && KNOWN_CREDS="$SRC_CFG/.credentials.json"
mkdir -p "$cell/home/.claude"
cp "$KNOWN_CREDS" "$cell/home/.claude/.credentials.json"
( cd "$wt" && HOME="$cell/home" CLAUDE_CONFIG_DIR="$cfg" claude --print ... )
```

### `bench/token-savers/run-matrix.sh`
Removed `chmod 444` guard (no longer needed; HOME isolation makes it unnecessary and it would break the dispatch session's own auth).

### `bench/token-savers/lib.sh`
Auto-detects `BASE` from script's actual location (`${BASH_SOURCE[0]}`), so the harness works when run from either the main repo OR a worktree. Previously `REPO` was hardcoded to main repo path, causing goal files to be missing when run from worktrees.

## Validation (pr965/baseline/r1)

### Assertion (a): Non-empty real code diff
```
wc -c runs/pr965/baseline/r1/agent.diff
32806 runs/pr965/baseline/r1/agent.diff
```
- `result.json`: `is_error: false`, `api_error_status: null`, `num_turns: 140`, `duration_ms: 1538205`
- Zero occurrences of "401" or "authentication" in result.json
- `agent.diff` starts with: `diff --git a/app/api/matches/[id]/route.ts b/app/api/matches/[id]/route.ts`
- **PASS** ✓

### Assertion (b): Global creds unchanged
```
wc -c /root/.claude/.credentials.json
471 /root/.claude/.credentials.json
```
Measured before, during, and after the 25.6-minute cell run. Never changed.
- Confirmed via `/proc/3583088/environ`: `HOME=/root/.../runs/pr965/baseline/r1/home` ← per-cell
- **PASS** ✓

## Matrix Launch

```
[14:52:06] MATRIX BEGIN — MAXP=4
[14:52:06] Feature tasks: pr964 pr965 pr970, arms: baseline caveman rtk cavecrew all, reps: 1 2 3
[14:52:06] Probe arms: baseline rtk all, reps: 1 2 3
[14:52:06] Total cells: 54
[14:52:06] START cell: pr964/baseline/r1
...
```

- **Matrix PID**: 3816560
- **Live worktrees**: 6 (confirmed via `git worktree list | grep -c runs/`)
- **Expected**: 54 cells, ~1.5h runtime
- **Command**: `setsid nohup bash run-matrix.sh > runs/matrix.log 2>&1`
- **Log**: `bench/token-savers/runs/matrix.log`

## Next Steps (orchestrator)
After matrix completes (~16:22 CEST):
1. Run `bench/token-savers/aggregate.sh` (or equivalent) to produce RESULTS.md
2. Run judge/pairwise comparison
3. Review results in RESULTS.md
