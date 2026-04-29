# Phase 4 — Verdict

**Date:** 2026-04-28  
**Reviewer:** test-skill (adversarial QA, cold-start)  
**Target:** PR #8 wave-alpha, post-merge on `main` of `Vitali2011/quantika-demo`

---

## ⛔ BLOCK

**Reason:** Security bug confirmed — auth bypass in `lib/whatsapp/signature.ts`.

BUG-A1-1 allows a forged WhatsApp webhook to bypass HMAC verification when `WHATSAPP_APP_SECRET` is empty (env var unset). An attacker who sends the correct HMAC computed with an empty key will be authenticated. This is a full auth bypass for the webhook endpoint.

Per the verdict decision tree:
> "Security bug (XSS reaches DOM, auth bypass, SQL injection)" → **BLOCK**

Additionally, 5 HIGH findings are present that were not pre-existing on `main` (all introduced by wave-alpha):
> "Any HIGH finding that is NOT pre-existing on main" → **BLOCK**

---

## Required fixes before production use

### P0 — Fix immediately (BLOCK conditions)

| ID | File | Fix |
|---|---|---|
| BUG-A1-1 | `lib/whatsapp/signature.ts:6` | Add `!appSecret` guard: `if (!signature \|\| !appSecret) return false;` |

### P1 — Fix before first real user (HIGH)

| ID | File | Fix |
|---|---|---|
| BUG-A2-H4 | `lib/confidence.ts:26` | Change null-check to `if (score === null \|\| score === undefined \|\| !Number.isFinite(score)) return 'missing';` |
| BUG-A3-1/2/3 | `lib/economics/ets.ts:35` | Extend guard: `if (distanceNm <= 0 \|\| euLegPercent <= 0 \|\| euLegPercent > 1 \|\| vlsfoBurnMt <= 0 \|\| euaPrice <= 0) return { amountEur: 0, applicable: false };` |
| BUG-A4-1 | `lib/whatsapp/forward-parser.ts:75` | Add `if (!rawText) return { confidence: 'uncertain', missingFields: ['unsupported message type'], rawText: '' };` after the switch |
| BUG-A6-H14 | `lib/sanctions/opensanctions.ts:61` | Add `if (!name.trim()) return [];` before `hashQuery` |

### P2 — Fix soon (MEDIUM)

| ID | File | Fix |
|---|---|---|
| BUG-A2-H5 | `lib/confidence.ts:107` | Guard empty criticalFields: return `level: 'missing'` or throw |
| BUG-A3-4 | `lib/economics/war-risk.ts:54` | Use word-boundary regex for port matching |
| BUG-A3-5 | `lib/economics/war-risk.ts:67` | Validate `vesselValueUsd > 0` |

### P3 — Nice to have (LOW)

| ID | File | Fix |
|---|---|---|
| BUG-A2-H8 | `lib/confidence.ts:26` | Covered by P1 fix (BUG-A2-H4 guard uses `!Number.isFinite`) |

---

## Test files produced

```
tests/regression/
├── test_whatsapp_signature_security.test.ts    (12 tests, 3 fail)
├── test_confidence_gate_property.test.ts       (28 tests, 7 fail)
├── test_economics_edge_cases.test.ts           (23 tests, 7 fail)
├── test_forward_parser_edge_cases.test.ts      (9 tests, 6 fail)
└── test_sanctions_rtl_trial.test.ts            (12 tests, 1 fail)
```

Total: 84 new regression tests. 24 currently failing — each failing test documents a real bug. Tests will go green after the corresponding fix is applied. Do not delete them.

---

## What passed

- All 15 wave-alpha specs delivered working code for their primary happy paths
- 1349 existing tests still green (lint + build confirmed in retro)
- Migration version collision fix (`007-opensanctions-cache: version 7`) confirmed correct
- RTL detection logic — all edge cases correct (boundary, Farsi, emoji, mixed)
- Trial expiry logic — clamp + `Math.ceil` behavior correct
- WhatsApp HMAC with correct secret — multiple test vectors pass
- War risk double-zone counting — uses `Math.max` correctly
- OpenSanctions cache TTL eviction — staleness check correct

---

## Notes for Wave β

1. **BUG-A1-1 is the only true showstopper** for production. The others can coexist with the demo, but should be fixed before freight forwarder onboarding.
2. Economics calculator bugs (A3-1/2/3) would only manifest with malformed inputs from the pipeline — the pipeline currently produces valid positive values. But the absence of guards is a liability.
3. BUG-A4-1 (unknown WhatsApp types → API call) is a slow money leak in production; low urgency for demo.
4. The `appSecret` empty-string bypass is likely masked in the current Caddy setup (demo doesn't have real Meta integration yet), but must be fixed before WhatsApp credentials are activated.
