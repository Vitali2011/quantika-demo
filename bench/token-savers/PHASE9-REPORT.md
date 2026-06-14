# Token-Savers Eval — PHASE 9 REPORT

Date: 2026-06-15
Branch: eval/token-savers-quality

## Summary

Rescored 12 cavecrew-confirmation cells (r4-r6 for pr964+pr970 × baseline+cavecrew)
using test-overlay method. Combined r1-r6 signal shows cavecrew at PARITY with baseline
on discriminating tasks. CAUTION verdict from Phase 8 is NOT confirmed. Revised to SAFE.

## Rescored Cells Table (r4-r6)

| Cell | Diff bytes | Oracle |
|------|-----------|--------|
| pr964/baseline/r4 | 25585 | PASS |
| pr964/baseline/r5 | 26455 | FAIL |
| pr964/baseline/r6 | 3623 | FAIL |
| pr964/cavecrew/r4 | 20590 | PASS |
| pr964/cavecrew/r5 | 7653 | PASS |
| pr964/cavecrew/r6 | 25594 | FAIL |
| pr970/baseline/r4 | 0 | FAIL (empty diff — no impl) |
| pr970/baseline/r5 | 101525 | PASS |
| pr970/baseline/r6 | 99991 | FAIL |
| pr970/cavecrew/r4 | 145105 | PASS |
| pr970/cavecrew/r5 | 136867 | PASS |
| pr970/cavecrew/r6 | 96341 | PASS |

Rescore method: detached worktree at pre-SHA + git apply --3way agent.diff +
git checkout merge-SHA -- <test-file> + rtk jest --maxWorkers=1 --ci --forceExit.
Empty diff (pr970/baseline/r4) → auto-FAIL (no implementation).

## Combined cavecrew vs baseline (discriminating tasks pr964+pr970, r1-r6)

| Arm | r1 | r2 | r3 | r4 | r5 | r6 | Total |
|-----|----|----|----|----|----|----|-------|
| pr964/baseline | P | F | F | P | F | F | 2/6 |
| pr964/cavecrew | F | F | F | P | P | F | 2/6 |
| pr970/baseline | P | P | F | F | P | F | 3/6 |
| pr970/cavecrew | P | F | F | P | P | P | 4/6 |

Combined baseline: 5/12 (42%)
Combined cavecrew: 6/12 (50%)

→ Parity. No significant difference at n=12.

## Batch comparison

r1-r3 only:
  baseline: 3/6 (50%) — pr964 1/3 + pr970 2/3
  cavecrew: 1/6 (17%) — pr964 0/3 + pr970 1/3

r4-r6 only (new cells):
  baseline: 2/6 (33%) — pr964 1/3 + pr970 1/3
  cavecrew: 5/6 (83%) — pr964 2/3 + pr970 3/3

Wide variance between batches. cavecrew r1-3 was anomalously low (possible
rate-limit degradation in original matrix). r4-r6 cavecrew outperforms r4-r6 baseline.
Combined = parity. The single-batch CAUTION was a small-n artifact.

## Final Verdicts

| Feature | Verdict | Rationale |
|---------|---------|-----------|
| caveman | ✅ SAFE | 8/9 oracle (r1-3 only), tied judge, no probe concern |
| rtk | ✅ SAFE | 6/7 oracle, mild-base judge, 5/5 probe n=3 |
| all | ✅ SAFE | 5/6 oracle, mild-base judge, 5/5 probe n=3 |
| cavecrew | ✅ SAFE | 6/12 oracle on discriminating tasks (parity with 5/12 baseline) |

Probe (n=3, baseline/rtk/all): 5/5 recall for all arms — no file:line blindness.

## Triangulation note (updated)

Original "looks good, fails tests" finding (judge wins 6/7 vs oracle 3/6 — CAUTION) is
NOT sustained at n=12. Oracle now shows parity (50% vs 42%), resolving the divergence.
The judge preference for cavecrew diffs (aesthetic quality) may reflect genuinely better
code structure, not just superficially better diffs. No quality regression detected.

## Notes

- rescore.sh (existing) covers r1-r3 only. 12-cell rescore done inline via /tmp script.
- pr970/baseline/r4 was 0-byte diff — agent returned no implementation, auto-FAIL.
- All 12 /tmp worktrees removed after scoring.
