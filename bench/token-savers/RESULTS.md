# Token-Savers Quality Eval — RESULTS (final, rescored r4-r6)

Branch: eval/token-savers-quality · 2026-06-14/15 · n=3–6/cell (directional)

## VERDICT per feature

| Feature | Verdict | Oracle (clean) | Judge (base/feat wins) | Probe recall |
|---|---|---|---|---|
| caveman | ✅ SAFE | 8/9 (best, r1-3) | 5/4 tied | — |
| rtk | ✅ SAFE | 6/7 (r1-3) | 5/3 mild-base | 5/5 (n=3, no blindness) |
| all | ✅ SAFE | 5/6 (r1-3) | 4/2 mild-base | 5/5 (n=3, no blindness) |
| cavecrew | ✅ SAFE | 6/12 discrim (r1-6) — parity | 1/6 (cavecrew looks better) | — |
| baseline | — | 5/12 discrim (r1-6) | — | 5/5 (n=3) |

## Key finding (triangulation)

cavecrew at PARITY with baseline at n=12 on discriminating tasks (pr964+pr970):
cavecrew 6/12 (50%) vs baseline 5/12 (42%). Original CAUTION (r1-3 only, 1/6 = 17%)
was not confirmed by r4-6 extension (5/6 = 83%). Combined signal = parity.

Judge prefers cavecrew diffs (won 6/7 comparisons) and tests confirm parity → the
"looks good, fails tests" triangulation is NOT sustained at n=12. Cavecrew verdict
revised from CAUTION to SAFE.

caveman/rtk/all do NOT hurt code quality. rtk and all passed the file:line-blindness
probe (5/5 = baseline, confirmed n=3). caveman exempts code blocks by design (8/9, best arm).

High variability note: cavecrew r1-3 on discriminating tasks = 1/6 (17%), r4-6 = 5/6
(83%). Variance is wide at small n — treat all verdicts as directional, not proven.

## Caveats
- Probe n=3 (all 9 cells green, 5/5 recall for baseline/rtk/all). No blindness detected.
- Infra: required a long-lived setup-token; OAuth rotation broke earlier attempts.
- cavecrew r1-3 original signal (CAUTION) was not confirmed by r4-6 reps. Verdict
  updated. High run-to-run variance observed; n too small to be conclusive either way.

## Oracle pass-rate by (task, arm) — FINAL (r1-6 where available)

pr964 (r1-6): baseline 2/6, caveman 3/3, rtk 2/3, cavecrew 2/6, all 2/3
pr965 (r1-3): baseline 3/3, caveman 3/3, rtk 3/3, cavecrew 3/3, all 3/3
pr970 (r1-6): baseline 3/6, caveman 2/3, rtk 1/3, cavecrew 4/6, all 0/3

Combined discriminating (pr964+pr970, r1-6):
  baseline 5/12 (42%), cavecrew 6/12 (50%) — parity

r4-r6 new cells (rescore 2026-06-15):
  pr964/baseline: r4=PASS, r5=FAIL, r6=FAIL (1/3)
  pr964/cavecrew: r4=PASS, r5=PASS, r6=FAIL (2/3)
  pr970/baseline: r4=FAIL(empty), r5=PASS, r6=FAIL (1/3)
  pr970/cavecrew: r4=PASS, r5=PASS, r6=PASS (3/3)
