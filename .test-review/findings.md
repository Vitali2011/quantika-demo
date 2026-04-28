# Phase 3 — Findings

**Date:** 2026-04-28  
**Reviewer:** test-skill (adversarial QA, cold-start)  
**Target:** PR #8 wave-alpha → main (`Vitali2011/quantika-demo`)

---

## CRITICAL

### BUG-A1-1 — WhatsApp webhook signature — empty `appSecret` auth bypass

**File:** `lib/whatsapp/signature.ts`  
**Test:** `tests/regression/test_whatsapp_signature_security.test.ts` — **3 tests FAIL**  
**Severity:** CRITICAL — auth bypass

**Failing input:**
```typescript
// appSecret = "" (env var WHATSAPP_APP_SECRET unset)
const body = '{"object":"whatsapp_business_account","entry":[...]}';
const sig = `sha256=${createHmac('sha256', '').update(body).digest('hex')}`;
verifyWebhookSignature(body, sig, '') // → true (WRONG, expected false)
```

**Root cause:** `createHmac('sha256', '')` is valid Node.js — HMAC with empty key is a defined operation. The function guards `if (!signature)` but never guards `if (!appSecret)`. Any attacker who sends a webhook with the HMAC computed using an empty key will be authenticated if the server's `WHATSAPP_APP_SECRET` env var is unset/empty.

**Fix:**
```typescript
export function verifyWebhookSignature(rawBody, signature, appSecret): boolean {
  if (!signature || !appSecret) return false; // ← add !appSecret guard
  ...
}
```

---

## HIGH

### BUG-A2-H4 — Confidence engine — NaN score silently blocks all sends

**File:** `lib/confidence.ts` → `mapConfidenceToLevel`  
**Test:** `tests/regression/test_confidence_gate_property.test.ts` — **4 tests FAIL**  
**Severity:** HIGH

**Failing input:** `mapConfidenceToLevel(NaN, false)` → `'uncertain'`

`NaN >= 0.85` and `NaN >= 0.5` are both `false` in JavaScript. A NaN score falls through to `return 'uncertain'`. If the LLM pipeline emits a corrupted JSON number (e.g., `parseFloat("")` or a division by zero in a scoring helper), every field is classified as `uncertain`, setting `blockSend: true` for every match. The user cannot send any quote.

Expected: NaN should map to `'missing'` (field absent/corrupted), same as `null`/`undefined`.

**Fix:** `if (score === null || score === undefined || !Number.isFinite(score)) return 'missing';`

---

### BUG-A3-1 — EU ETS calculator — negative `vlsfoBurnMt` produces negative cost

**File:** `lib/economics/ets.ts` → `calculateEuEts`  
**Test:** `tests/regression/test_economics_edge_cases.test.ts` — **FAIL**  
**Severity:** HIGH — financial corruption

**Failing input:** `{ distanceNm: 100, euLegPercent: 0.5, vlsfoBurnMt: -50, euaPrice: 87.5 }`  
**Actual output:** `{ amountEur: -6811.87, applicable: false }`

The guard `distanceNm <= 0 || euLegPercent <= 0` doesn't include `vlsfoBurnMt`. A negative fuel burn bypasses it, producing a negative ETS cost. `applicable: false` is set, but `amountEur` is still a negative number. Downstream aggregators that sum `.amountEur` without checking `.applicable` silently subtract cost from the quote total.

**Fix:** Extend guard: `if (distanceNm <= 0 || euLegPercent <= 0 || vlsfoBurnMt <= 0) return { amountEur: 0, applicable: false };`

---

### BUG-A3-2 — EU ETS calculator — `euLegPercent > 1.0` not validated

**File:** `lib/economics/ets.ts` → `calculateEuEts`  
**Test:** `tests/regression/test_economics_edge_cases.test.ts` — **FAIL**  
**Severity:** HIGH — financial inflation

**Failing input:** `{ distanceNm: 1000, euLegPercent: 2.0, vlsfoBurnMt: 100, euaPrice: 87.5 }`  
**Actual output:** `{ amountEur: 54495, applicable: true }` (double the legitimate maximum of 27247.5)

Interface comment says `// 0.0–1.0` but no enforcement. A caller passing a percentage as `50` (meaning 50%) instead of `0.50` inflates the ETS charge 50×.

**Fix:** `if (euLegPercent < 0 || euLegPercent > 1.0) throw new RangeError('euLegPercent must be 0–1');` or clamp.

---

### BUG-A3-3 — EU ETS calculator — negative `euaPrice` produces negative cost

**File:** `lib/economics/ets.ts` → `calculateEuEts`  
**Test:** `tests/regression/test_economics_edge_cases.test.ts` — **FAIL**  
**Severity:** HIGH — financial corruption (same root as A3-1)

**Failing input:** `{ distanceNm: 1000, euLegPercent: 0.5, vlsfoBurnMt: 100, euaPrice: -87.5 }`  
**Actual output:** `{ amountEur: -13623.75, applicable: false }`

EUA prices cannot be negative in the real world. No validation exists.

**Fix:** Add `euaPrice <= 0` to the early-return guard.

---

### BUG-A4-1 — Forward parser — unknown message types reach OpenAI API

**File:** `lib/whatsapp/forward-parser.ts` → `parseForwardedMessage`  
**Test:** `tests/regression/test_forward_parser_edge_cases.test.ts` — **6 tests FAIL**  
**Severity:** HIGH — cost leakage + unnecessary external calls

**Failing message types:** `sticker`, `location`, `reaction`, `video`, `contacts`, `order`

All fall through the switch with `rawText = ''`. The `callAiJson('', SYSTEM_PROMPT, ...)` call is unconditional — outside the switch. Every unsupported type fires a real OpenAI API call with empty input, discards the result, and returns `confidence: 'uncertain'`. In a production WhatsApp Business account, every sticker or reaction triggers a paid API call.

**Fix:** Add guard after the switch:
```typescript
if (!rawText) {
  return { confidence: 'uncertain', missingFields: ['unsupported message type'], rawText: '' };
}
```

---

### BUG-A6-H14 — OpenSanctions — empty vessel name hits external API

**File:** `lib/sanctions/opensanctions.ts` → `searchOpenSanctions`  
**Test:** `tests/regression/test_sanctions_rtl_trial.test.ts` — **1 test FAIL**  
**Severity:** HIGH — API quota depletion (1000 req/day free tier)

**Failing input:** `searchOpenSanctions("")`

No early return for empty/blank name. The function hashes `""`, gets a cache miss, and POSTs `{ name: [""] }` to the API. Free tier is 1000 requests/day. Any code path that calls `checkVesselSanctions` with a missing IMO/name (which happens for unmatched vessels) wastes quota.

**Fix:** `if (!name.trim()) return [];` before the `hashQuery` call.

---

## MEDIUM

### BUG-A2-H5 — Confidence engine — empty criticalFields silently approves any match

**File:** `lib/confidence.ts` → `computeMatchConfidence`  
**Test:** `tests/regression/test_confidence_gate_property.test.ts` — **1 test FAIL**  
**Severity:** MEDIUM — silent footgun

**Input:** `computeMatchConfidence(cargo, vessel, [])`  
**Output:** `{ level: 'verified', blockSend: false }` — full approval with zero fields checked.

`Array.reduce` identity `'verified'` is returned when the criticalFields array is empty. Any caller that accidentally passes an empty array (filtered result, spread error) gets a silent green light.

**Fix:** `if (criticalFields.length === 0) return { level: 'missing', blockSend: false, blockedFields: [], fieldConfidences: [] };` or throw.

---

### BUG-A3-4 — War risk — substring false positive on port names

**File:** `lib/economics/war-risk.ts` → `calculateWarRiskPremium`  
**Test:** `tests/regression/test_economics_edge_cases.test.ts` — **FAIL**  
**Severity:** MEDIUM — incorrect premium charged

**Failing inputs:**  
- `fromPort: "Lagoswana"` → contains `"lagos"` → Gulf of Guinea HRA matched → premium charged  
- `fromPort: "Sindakar"` → contains `"dakar"` → Gulf of Guinea HRA matched → premium charged

`String.includes()` has no word-boundary check. Any port name that contains a keyword as a substring triggers the HRA classification.

**Fix:** Use word-boundary regex `/\blagos\b/i` or switch to UN/LOCODE exact matching.

---

### BUG-A3-5 — War risk — negative `vesselValueUsd` returns negative premium

**File:** `lib/economics/war-risk.ts` → `calculateWarRiskPremium`  
**Test:** `tests/regression/test_economics_edge_cases.test.ts` — **FAIL**  
**Severity:** MEDIUM

**Failing input:** `{ fromPort: 'Lagos', toPort: 'Rotterdam', vesselValueUsd: -10_000_000, daysInHra: 5 }`  
**Actual output:** `{ premiumUsd: -68.49, zones: ['Gulf of Guinea HRA'] }`

A negative vessel value produces a negative premium — effectively a credit. No validation on vessel value sign.

**Fix:** Add `if (vesselValueUsd <= 0) return { premiumUsd: 0, zones: [] };`

---

## LOW

### BUG-A2-H8 — Confidence engine — Infinity score accepted as `verified`/`inferred`

**File:** `lib/confidence.ts` → `mapConfidenceToLevel`  
**Test:** `tests/regression/test_confidence_gate_property.test.ts` — **2 tests FAIL**  
**Severity:** LOW

`Infinity >= 0.85` is `true`. `Infinity` passes as the highest possible confidence score. Realistic risk is low (LLM pipeline scores are 0–1), but a division-by-zero in a scoring utility could produce `Infinity`.

**Fix:** Covered by the `!Number.isFinite(score)` guard in BUG-A2-H4 fix above.

---

## Coverage gaps (meta-bugs for upstream skills)

None identified. The existing wave-pipeline Phase V integration tests and dev-pipeline TDD tests did not cover:
- Security properties (empty secret, HMAC bypass)
- Financial invariants (negative inputs to calculators)
- AI client call side-effects for unknown message types
- API quota depletion for empty inputs

These are property/adversarial classes that are outside the scope of standard TDD and integration checks — this is expected per test-skill's remit.

---

## Confirmed clean (no bugs found)

| Module | Result |
|---|---|
| Migration version uniqueness (versions 1–7) | PASS — collision fix verified |
| `detectTextDirection` — boundary/edge cases | PASS |
| `daysRemaining` — clock skew, expiry clamp | PASS |
| HMAC wrong prefix, length mismatch | PASS |
| Confidence score boundary 0.5 / 0.4999 | PASS |
| War risk double-zone counting | PASS |
| OpenSanctions cache TTL eviction | PASS |
| `msg.text.body = undefined` in forward parser | PASS |

---

## Totals

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 5 |
| MEDIUM | 3 |
| LOW | 1 |
| **Total** | **10** |

Failing tests by file:

| Test file | Failing | Total |
|---|---|---|
| `test_whatsapp_signature_security.test.ts` | 3 | 12 |
| `test_confidence_gate_property.test.ts` | 7 | 28 |
| `test_economics_edge_cases.test.ts` | 7 | 23 |
| `test_forward_parser_edge_cases.test.ts` | 6 | 9 |
| `test_sanctions_rtl_trial.test.ts` | 1 | 12 |
| **Total** | **24** | **84** |
