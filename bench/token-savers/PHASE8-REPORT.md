# Token-Savers Eval — PHASE 8 REPORT

Date: 2026-06-15
Branch: eval/token-savers-quality

## LEG 1: Probe n=3 (COMPLETE)

All 9 probe cells (baseline/rtk/all × r1-r3) now complete with is_error=False.
Probe-recall.txt contains full n=3 results.

| Arm | r1 | r2 | r3 | Mean recall |
|-----|----|----|-----|-------------|
| baseline | 5/5 | 5/5 | 5/5 | 1.00 |
| rtk | 5/5 | 5/5 | 5/5 | 1.00 |
| all | 5/5 | 5/5 | 5/5 | 1.00 |

**Finding**: No file:line blindness in rtk or all arm at n=3 (parity with baseline).
Confirms: rtk/all SAFE verdict for probe dimension.

## LEG 2: cavecrew Confirmation (IN PROGRESS — detached)

12 new cells launched detached 2026-06-15T00:36:26:
- pr964: baseline r4/r5/r6, cavecrew r4/r5/r6
- pr970: baseline r4/r6/r6, cavecrew r4/r5/r6

PIDs: 2423936 2424150 2424492 2425197 2425410 2425770 2426103 2426375 2426624 2426897 2427178 2427480
Logs: bench/token-savers/runs/<task>-<arm>-r<rep>-confirm.log
Marker: bench/token-savers/CAVECREW-CONFIRM-LAUNCHED.txt

Status at report time: all 12 worktrees initialized, agent runs in progress.
Expected completion: ~30-45 min after launch.

To rescore after completion:
```bash
cd bench/token-savers
bash rescore.sh 2>&1 | grep -E "^\\[|DONE"
```
Then aggregate by reading oracle.txt for r4-r6 cells.

### Prior cavecrew signal (r1-r3 only, discriminating tasks)
- pr964/cavecrew: 0/3 PASS
- pr970/cavecrew: 0/3 valid clean runs (r1-r3 all rate-limited in original matrix)
- Combined prior signal: 0/6 clean passes

The r4-r6 reps will add signal on pr964 (0/3 baseline HURTS cavecrew) and pr970.
If cavecrew r4-r6 still fails → CAUTION verdict strengthens.
If cavecrew r4-r6 mostly passes → reassess (possible rate-limit artifact in r1-r3).

## LEG 3: Aggregate + RESULTS.md (COMPLETE)

Updated RESULTS.md:
- Probe n=3 confirmed: all arms 5/5 recall
- rtk/all probe column updated: "5/5 (n=3, no blindness)"
- Added cavecrew confirmation note in Caveats section
- Verdicts unchanged from hand-corrected analysis (automated aggregate.mjs uses
  different verdict logic that doesn't capture the cavecrew divergence pattern)

## Final Verdicts (unchanged, pending cavecrew reps)

| Feature | Verdict | Rationale |
|---------|---------|-----------|
| caveman | ✅ SAFE | 8/9 oracle, tied judge, no probe concern |
| rtk | ✅ SAFE | 6/7 oracle, mild-base judge, 5/5 probe (n=3) |
| all | ✅ SAFE | 5/6 oracle, mild-base judge, 5/5 probe (n=3) |
| cavecrew | ⚠️ CAUTION | 3/6 oracle (worse), judge likes it but tests fail |

**Key insight**: cavecrew produces plausible-looking diffs that fail tests more often.
"Looks good, doesn't work" pattern. Don't use for quality-critical code.

## Next steps (post-session)

1. Wait ~45min for cavecrew confirm cells to finish
2. Run rescore.sh to get clean oracle scores for r4-r6
3. If cavecrew r4-r6 pass-rate > 4/12 → re-evaluate CAUTION
4. Run aggregate.mjs again once all reps scored
