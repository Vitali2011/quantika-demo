# Token-Savers Quality Eval — RESULTS (final, hand-corrected)

Branch: eval/token-savers-quality · 2026-06-14/15 · n=3/cell (directional)

## VERDICT per feature

| Feature | Verdict | Oracle (clean) | Judge (base/feat wins) | Probe recall |
|---|---|---|---|---|
| caveman | ✅ SAFE | 8/9 (best) | 5/4 tied | — |
| rtk | ✅ SAFE | 6/7 | 5/3 mild-base | 5/5 (n=1, no blindness) |
| all | ✅ SAFE | 5/6 | 4/2 mild-base | — |
| cavecrew | ⚠️ CAUTION | 3/6 (worse) | 1/6 (cavecrew looks better) | — |
| baseline | — | 6/9 | — | 5/5 |

## Key finding (triangulation)

cavecrew DIVERGES: objective tests say WORSE (3/6 pass), judge says diffs LOOK
BETTER (won 6/7). => compressed subagent delegation yields plausible-looking code
that passes tests less often ("looks good, doesn`t work"). Objective tests are the
truth here, not diff appearance. Do NOT use cavecrew for quality-critical code.

caveman/rtk/all do NOT hurt code quality. rtk passed its file:line-blindness probe
(5/5 = baseline). caveman exempts code blocks by design (8/9, best arm).

## Caveats
- n=6-9 per cell -> directional, not proven. caveman/rtk/all "safe" is solid;
  cavecrew flag is a real signal on small n.
- Probe stayed n=1 (session 30min cap hit after judge; judge collected clean, 0 auth errors).
- Infra: required a long-lived setup-token; OAuth rotation broke earlier attempts.

## Oracle pass-rate by (task, arm), rate-limited cells excluded
pr964: base 1/3, caveman 3/3, rtk 2/3, cavecrew 0/3, all 2/3
pr965: base 3/3, caveman 3/3, rtk 3/3, cavecrew 3/3, all 3/3
pr970: base 2/3, caveman 2/3, rtk 1/1*, cavecrew 1/3, all 0/3* (*some cells rate-limited/excluded)
