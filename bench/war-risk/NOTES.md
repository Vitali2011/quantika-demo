# Bench run notes — war-risk model benchmark

## Harness invariants (learned the hard way)

- **NEVER restart / kill the matrix while arms are running.** Killing the matrix
  runner cascades SIGTERM/SIGHUP into the `nohup`'d run-arm children it launched.
  Claude exits mid-run → empty `run.json` → `parse-usage` falls back to
  `0\t0\t0\t0\t0` → that run is silently poisoned, and the matrix then SKIPS it
  (usage.tsv exists = "done"). Corrupted r1s so far: sonnet-max (cleared+retried),
  opus-low, opus-high. Only restart when **fully idle** (no run-matrix.sh, no
  `max-budget-usd` procs).

- **`running()` must count worktrees, not `pgrep run-arm.sh`.** Each run-arm spawns
  a subshell sharing the same cmdline → pgrep double-counts → MAX_PAR=2 silently
  ran 1-at-a-time. Fixed 2026-06-13 (count `worktrees/*/`, 1:1 with active arms).

- A run is **valid** iff usage.tsv ≠ all-zeros AND solution.diff is non-empty CODE
  (touches lib/economics/_, not docs/superpowers/plans/_).

## Mop-up procedure (run ONLY when idle)

1. `for f in results/*/r*/usage.tsv; do grep -q '^0\t0\t0' "$f" && rm -rf "$(dirname "$f")"; done`
2. relaunch matrix (idle → no corruption); it fills the holes.
3. repeat until no zero-rows.

## Valid results so far

- opus-med r1: $3.09, 754s, in15332/out35524, 34 turns — 7 files, +460/-19 real code.
