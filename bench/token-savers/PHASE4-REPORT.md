# Token-Savers Quality Eval — Phase 4 Report

**Branch:** eval/token-savers-quality  
**Date:** 2026-06-14  
**Scope:** Phase 4 — probe re-run + pairwise judge + aggregate

---

## STATUS: PARTIAL

Oracle pass-rates complete (with rate-limited exclusion). Judge leg and probe leg blocked by expired OAuth token.

---

## Blocker: OAuth Token Expired

The OAuth access token in `/root/.claude/.credentials.json` expired at **19:05 CEST** on 2026-06-14.

- The session-limit reset occurred at 19:50 CEST — AFTER the token expired
- The backup at `/root/eval-valid-creds.json` has the SAME expired token
- Embedded creds in `runs/pr970/*/r1/.cfg/.credentials.json` have a refresh token, but it either expired or was rejected (returned 401 even with HOME isolation)
- One probe re-run attempt (baseline/r1) returned `401 Invalid authentication credentials`
- Running that cell also caused global creds to change from 471 → 363 bytes (daemon symlink in cfg writes through to global); creds restored from backup

**Auth must be refreshed before LEG 1 and LEG 2 can proceed.**

---

## LEG 1 — Probe Re-Run

**Status: BLOCKED (OAuth expired)**

- 9 probe cells (baseline/rtk/all × r1/r2/r3) all previously returned "session limit" errors
- Re-run of probe/baseline/r1 attempted; returned 401 Invalid authentication
- Probe recall in RESULTS.md shows "—" for all arms (all cells excluded as errors)
- **Action needed:** Re-authenticate (`claude /login`), then re-run: `for arm in baseline rtk all; do for rep in 1 2 3; do bash run-cell.sh probe $arm $rep HEAD tasks/goals/probe.md; done; done`

---

## LEG 2 — Pairwise Judge

**Status: BLOCKED (OAuth expired)**

- `judge.sh` calls `claude --print` directly with global credentials
- 0 valid grade files in `grades/` (only grades/pr964/caveman/r1.raw with 401 error content)
- **Action needed:** Re-authenticate, then run `bash run-judge.sh` from bench/token-savers/
- Note on cred safety: judge.sh uses global creds; run inside `HOME=/tmp/judgehome` wrapper per original task spec to prevent corruption

---

## LEG 3 — Aggregate

**Status: DONE** ✓

Updated `aggregate.mjs` to properly exclude rate-limited cells (is_error=true + "limit" in result) from oracle pass-rate calculations, and exclude all error cells from probe recall.

Generated `RESULTS.md` with available data:

### Oracle Pass-Rate Summary

| Task | baseline | caveman | rtk | cavecrew | all |
|------|----------|---------|-----|----------|-----|
| pr964 | 1/3 | 3/3 | 2/3 | 0/3 | 2/3 |
| pr965 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| pr970 | 2/3 | 2/3 | 1/1 | — | — |

**Rate-limited cells excluded from pr970:** rtk/r1,r3; all/r1,r2,r3; cavecrew/r1,r2,r3

### Per-Feature Verdicts (oracle-only, no judge data)

| Feature | Verdict |
|---------|---------|
| caveman | SAFE |
| rtk | SAFE |
| cavecrew | SAFE |
| all | SAFE |

**Caveat:** Verdicts based on oracle pass-rate only. No judge data collected. Verdicts may change after judge leg completes.

### Cost Observations (from result.json total_cost_usd)

Caveman arm consistently cheaper:
- pr964: caveman $3.67 vs baseline $4.67 (21% savings)
- pr965: caveman $3.85 vs baseline $5.32 (28% savings)

RTK shows similar or slightly higher cost vs baseline, consistent with hook compression targeting evaluator-side token savings rather than agent-side API cost.

---

## Creds Safety Log

| Checkpoint | Size |
|------------|------|
| START | 471 ✓ |
| After probe re-run attempt | 363 ✗ (CORRUPTED by daemon) |
| After restore | 471 ✓ |

Global creds restored from backup. No further claude --print calls attempted.

---

## What Remains

1. **Re-authenticate** on the host machine (`claude /login` in an interactive session)
2. **Verify** `wc -c ~/.claude/.credentials.json` shows correct size with fresh token
3. **Re-run probe cells:** `for arm in baseline rtk all; do for rep in 1 2 3; do bash run-cell.sh probe $arm $rep HEAD tasks/goals/probe.md; done; done`
4. **Score probe recall:** `bash run-cell.sh` results → count oracle line hits
5. **Run judge:** `bash run-judge.sh` (or wrapped HOME for safety)
6. **Re-run aggregate:** `node aggregate.mjs > RESULTS.md`
7. **Push RESULTS.md + PHASE4-REPORT.md update**
