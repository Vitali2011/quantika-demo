# Phase 2 — Attack Surface

**Classified by:** test-skill adversarial QA  
**Date:** 2026-04-28

---

## Classification table

| # | File | Class | Technique | Severity | Reason |
|---|---|---|---|---|---|
| A1 | `lib/whatsapp/signature.ts` | Auth/security | Adversarial — empty appSecret, missing sig, replay | **CRITICAL** | Auth bypass = forged webhook messages; full feature disabled |
| A2 | `lib/confidence.ts` | Validator + gate | Property-based — boundary scores, NaN, empty criticalFields | **HIGH** | Wrong blockSend = either blocks valid quotes or passes unsafe data |
| A3 | `lib/economics/ets.ts` + `war-risk.ts` | Financial calculator | Property-based — negative inputs, zero values, out-of-range | **HIGH** | Wrong financial output = trust breakdown with freight forwarders |
| A4 | `lib/whatsapp/forward-parser.ts` | Input handler | Adversarial — unknown type, empty body, oversized, null fields | **HIGH** | Unhandled inputs reach AI API (cost waste + possible prompt injection) |
| A5 | `lib/migrations/index.ts` + `migrations/` | DB schema | Version collision / duplicate version check | **HIGH** | Already caused prod failure (migration collision); verify fix is robust |
| A6 | `lib/sanctions/opensanctions.ts` | Cache + API | Empty name, cache-TTL boundary, score threshold invariant | **HIGH** | Incorrect sanctions check = regulatory risk; cache bypass = rate limit |
| A7 | `lib/i18n/rtl-detect.ts` | Normalizer | Property-based — boundary 30%, Farsi/Urdu, mixed scripts, emoji | **MEDIUM** | Wrong direction → broken UI for Arabic users |
| A8 | `lib/trial.ts` | Business logic | Boundary dates, clock skew, INSERT OR REPLACE idempotency | **MEDIUM** | Trial reset on re-visit = product logic broken |
| A9 | `extensions/gmail/` | UI scaffold | Snapshot — manifest.json schema validity | **LOW** | Extension rejected by Chrome Web Store if manifest is malformed |

---

## Pre-identified attack hypotheses (from cold read of source)

### A1 — WhatsApp signature

**Hypothesis 1 (CRITICAL):** If `appSecret = ""` (env var unset), `verifyWebhookSignature(rawBody, correctHmacOfEmptyKey, "")` returns **`true`**. An attacker who knows the secret is empty (visible in open-source repo) can forge any webhook message.

- Attack: call `verifyWebhookSignature("payload", "sha256=<hmac('','payload')>", "")` → expected `false` but actual may be `true`.
- Mitigation expected: guard `if (!appSecret) return false` at function start.

**Hypothesis 2:** `timingSafeEqual` throws on length mismatch — verify it's caught correctly (it is, wrapped in try/catch returning `false`). ✓ already handled.

**Hypothesis 3:** Signature with wrong prefix `"hmac=abc"` (not `"sha256="`) — verify it's rejected. Should fail at `timingSafeEqual` due to length mismatch.

### A2 — Confidence engine

**Hypothesis 4:** `mapConfidenceToLevel(NaN, false)` returns `'uncertain'` → `blockSend: true`. If AI returns NaN scores for a valid match, ALL fields would be uncertain and no quote could ever be sent. Test: verify NaN handling.

**Hypothesis 5:** `computeMatchConfidence(cargo, vessel, [])` with empty criticalFields → `blockedFields = []`, `blockSend = false`, `overallLevel = 'verified'`. An empty critical field list would silently approve any cargo. Is this a bug or intentional?

**Hypothesis 6:** Score exactly `0.5` → `'inferred'` (not `'uncertain'`). Score `0.4999...` → `'uncertain'`. Verify boundary is not off-by-one.

### A3 — Economics calculators

**Hypothesis 7 (HIGH):** `calculateEuEts({ distanceNm: 100, euLegPercent: 0.5, vlsfoBurnMt: -50, euaPrice: 87.5 })` → `amountEur: negative_number`, `applicable: false`. The negative amount is returned to the caller. Downstream aggregator `computeEconomics()` may include negative ETS cost in total.

**Hypothesis 8:** `euLegPercent > 1.0` (e.g., `2.0`) → doubles the ETS liability. No validation. Test that overclaiming 200% EU leg doesn't silently inflate cost by 2×.

**Hypothesis 9:** `calculateWarRiskPremium` with `daysInHra = 0.5` (float) → `premiumPercent/100/365 * 0.5` = valid float. No integer validation. Edge case but not a bug.

**Hypothesis 10:** Port name matching is case-insensitive `.toLowerCase()` but requires substring match. `"LAGOS ANCHORAGE"` → `toLower = "lagos anchorage"` → contains `"lagos"` → Gulf of Guinea matched. ✓ But `"Port Lagos"` → `"port lagos"` → contains `"lagos"` ✓. `"Lagoswana"` → `"lagoswana"` → contains `"lagos"` → **FALSE POSITIVE BUG**. Port name "Lagoswana" (fictional) triggers Gulf of Guinea premium. Verify with realistic false-positive ports.

### A4 — Forward parser

**Hypothesis 11 (HIGH):** `msg.type = 'sticker'` (or `'location'`, `'reaction'`) falls through the switch with `rawText = ''`. Then `callAiJson('', PROMPT, ...)` is called — an unnecessary external API call with empty input. Should early-return `{ confidence: 'uncertain', missingFields: [...], rawText: '' }`.

**Hypothesis 12:** `msg.text.body = undefined` (type is 'text' but body is missing) → `rawText = undefined ?? ''` = `''`. Handled by nullish coalescing. ✓

### A5 — Migrations

**Hypothesis 13:** The collision fix renamed the file content from `version: 5` to `version: 7` inside `007-opensanctions-cache.ts`. Verify the actual migration file has the correct version number, not a lingering `5`.

### A6 — OpenSanctions

**Hypothesis 14:** `searchOpenSanctions("")` (empty vessel name) calls API with `{ name: [""] }`. Should return empty array early without hitting the API.

**Hypothesis 15:** Cache stores ALL results (above + below threshold). `checkVesselSanctions` filters at read time with `score >= 0.85`. If a vessel was cached with score 0.80 (below threshold), calling `checkVesselSanctions` returns `sanctioned: false`. If threshold later changes to 0.79, re-querying would still use cached 0.80 result correctly. ✓

---

## Attack execution order (Phase 3)

**Batch A — parallel (4 agents):**
1. A1: WhatsApp signature — CRITICAL security bypass
2. A2: Confidence gate — property tests
3. A3: Economics calculators — negative inputs, range validation
4. A4: Forward parser — unknown type, empty body

**Sequential (after Batch A results):**
5. A5: Migration version collision fix verification
6. A6: OpenSanctions empty-name guard
7. A7 + A8: RTL + Trial (medium severity, quick)
