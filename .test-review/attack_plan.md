# attack_plan.md — feat-bunker-oilmonster-blacksea adversarial QA (2026-06-02)
# Reviewer: cold-session adversarial QA

## Attack Surface: OilMonster Adapter

### File classification

| File | Class | Attack techniques |
|---|---|---|
| `lib/knowledge/bunker/oilmonster-adapter.ts` | HTML parser + orchestrator | Adversarial HTML, edge cases, range validation gaps |
| `parseOilMonsterPortHtml` | Per-port page parser | Regex fragility, missing decimal places, space before span |
| `parseOilMonsterHtml` | Main table parser | Already well-tested; minor edge cases remain |
| `refreshOilMonster` (per-port) | Orchestrator | Missing range validation for per-port prices |

### Attack vectors identified

#### B1 — Per-port prices have NO range validation [HIGH]

**File:** `oilmonster-adapter.ts` lines 297-325
**Finding:** The main table upsert validates prices against `RANGE_VLSFO [200, 2000]` and `RANGE_MGO [200, 2000]`. However per-port upserts (Istanbul TRIST, Piraeus GRPIR) have ZERO range validation. An unrealistic value like 99999.00 would be inserted directly into the DB.
**Reproducibility:** Confirmed by code review. ROCND proxy also has no range validation.
**Test needed:** YES — per-port out-of-range price should be rejected (or warn + skip)

#### B2 — ROCND proxy also bypasses range validation [MEDIUM]

**File:** `oilmonster-adapter.ts` lines 328-338
**Finding:** `rocndPrice = Math.round((istanbulResult.vlsfo + BLACK_SEA_PREMIUM_USD) * 100) / 100` is upserted with no range check. If Istanbul returns an extreme value that somehow passes per-port (see B1), ROCND would amplify it.
**Test needed:** Verify ROCND = Istanbul + 40 exactly with no float drift (confirmed OK), but flag the missing range check.

#### B3 — Regex implicitly requires `<i>` arrow icon element [MEDIUM]

**File:** `oilmonster-adapter.ts` line 189
**Regex:** `/class="scrapitemprice"[\s\S]*?>([\d,]+\.\d{2})<span>\$US\/MT/`
**Finding:** The non-greedy `[\s\S]*?>` match works ONLY because the `</i>` tag provides the `>` immediately before the price number. If OilMonster removes the arrow icon, the HTML becomes `>\\n947.00<span>` and the `\\n` before the price makes the regex fail (price would not follow immediately after a `>`).
**Confirmed:** Tested in Node.js — without `<i></i>`, `\\n` before price → NO MATCH → StructureChangedError.
**Test needed:** YES — document this fragility as a test that would catch a future site format change.

#### B4 — Price must have EXACTLY 2 decimal places [LOW]

**File:** `oilmonster-adapter.ts` line 189
**Regex:** `[\d,]+\.\d{2}` — requires exactly 2 decimal digits
**Finding:** Prices like `947.5` (1 decimal), `947` (no decimal), or `947.000` (3 decimals) would NOT match → throws StructureChangedError. This constraint is undocumented.
**Real risk:** Low for current site (all prices end in .00 or .25), but not tested.

#### B5 — Misleading test description name [LOW]

**File:** `__tests__/lib/knowledge/bunker/oilmonster-adapter.test.ts` line 202
**Finding:** Test is named `'throws OilMonsterParseError for non-numeric price text'` but the assertion is `expect(...).toThrow(OilMonsterStructureChangedError)`. The name says ParseError, the assertion says StructureChangedError. This is a test description bug only — the assertion itself is correct.

#### B6 — Staleness boundary arithmetic [VERIFIED OK]

**Finding:** `ageDays > MAX_AGE_DAYS` uses strict `>` so exactly 30 days = NOT stale (correct). Floating point: both `now` and `priceDate` midnight UTC, so division is exact. No off-by-one.
**Confirmed:** Tested in Node.js — 30 days exactly returns `ageDays === 30`, which is NOT > 30.

#### B7 — Constanta proxy arithmetic [VERIFIED OK]

**Finding:** `Math.round((947.00 + 40) * 100) / 100 = 987.00` — exact, no float drift.
**Confirmed:** Tested in Node.js.

### Attack priority

| ID | Severity | Has existing test? | Action |
|---|---|---|---|
| B1 | HIGH | No | Write adversarial test |
| B2 | MEDIUM | No | Write adversarial test |
| B3 | MEDIUM | Partial (fixture passes) | Write fragility test |
| B4 | LOW | No | Document only |
| B5 | LOW | Yes (wrong name only) | Document only |
| B6 | LOW | Yes | Confirmed OK |
| B7 | LOW | Yes | Confirmed OK |

---

# PREVIOUS REVIEW (attack plan from PR fix/demo-freshness-clock — 2026-06-01)

## Attack Surface Classification

### A1 — Dead code with wrong clock [MED] — formatAge

**File:** `app/matches/MatchesClient.tsx:67`
**Class:** frozen-too-little (partially unimplemented allow-list item)
**Severity:** LOW (dead code — never called in render)
**What would break:** If `formatAge` is ever called (e.g. a future dev wires it to a "created X ago" display), in demo mode it would show "Sun" / "Mon" (real wall-clock age from seed date), not "now" / "12:30". The match age would appear weeks-old instead of hours-old.
**Test approach:** Static analysis or add a lint rule requiring dead code removal. If activating formatAge: pass `clientNow` as a parameter, not `Date.now()`.

---

### A2 — isLaycanExpired nowSec optional — future contamination risk [MED]

**File:** `lib/utils/fmt-laycan.ts:18`
**Class:** frozen-too-little (incomplete freeze boundary)
**Severity:** MED
**What would break:** Any caller that invokes `isLaycanExpired(end, start)` without passing `nowSec` will get real wall-clock time in demo mode. All current callers in MatchesClient correctly pass `Math.floor(clientNow/1000)`, but server-side code (pair-analyzer, matching engine) may call the `lib/sailing/date-sanity.ts` variant (different function) — that one takes a `today: Date` object and is correctly wired via `now()`. The `fmt-laycan` variant is only used in client components. Risk is forward-looking.
**Test approach:** Verify that all current call-sites of `isLaycanExpired` from `lib/utils/fmt-laycan` pass explicit `nowSec`. Add a test asserting the function accepts a mock nowSec and returns the expected result (already partially covered in `__tests__/matches-556-laycan-expired.test.ts`).

---

### A3 — SAFETY-CRITICAL: No test verifying session expiry uses real time [HIGH]

**File:** `__tests__/demo-clock.test.ts` (missing test)
**Class:** deny-list contamination (test coverage gap)
**Severity:** HIGH
**What would break:** The plan mandates a safety-critical test that a login session still expires on real time when DEMO_MODE=true. If `session-store.ts` were accidentally modified to use `demoNow()` (e.g. a refactor), the existing test would NOT catch it. Sessions would never expire in demo mode → authentication bypass vulnerability.
**Test approach:**
```ts
it('SAFETY-CRITICAL: session-store expires_at uses real Date.now(), NOT frozen clock', () => {
  withEnv({ DEMO_MODE: 'true', DEMO_CLOCK: '2020-01-01' }, () => {
    const before = Date.now();
    const store = new SessionStore(':memory:');
    const id = store.createSession('tok');
    const row = store.getDatabase()
      .prepare('SELECT expires_at FROM sessions WHERE id = ?').get(id);
    const after = Date.now();
    // expires_at must be within [before + TTL, after + TTL], NOT near 2020-01-01
    const frozenNoon = new Date('2020-01-01T12:00:00.000Z').getTime();
    expect(row.expires_at).toBeGreaterThan(before);
    expect(row.expires_at).not.toBeCloseTo(frozenNoon, -3);
  });
});
```

---

### A4 — getDemoFrozenDate cache persistence across Jest workers [LOW]

**File:** `lib/demo-mode.ts:12-21`, `__tests__/demo-clock.test.ts`
**Class:** SSR mismatch (test isolation)
**Severity:** LOW
**What would break:** If a Jest worker happens to populate `_cachedFrozenDate` before demo-clock tests run (e.g. a test that calls `getDemoFrozenDate` with a mocked DB), the demo-clock fallback path tests (T2, T3 in the suite) would read the stale cache and return a wrong frozen date without the DEMO_CLOCK env var. Tests would pass for the wrong reason or give false negatives.
**Test approach:** Import `_resetDemoFrozenDateCache` from `@/lib/demo-mode` and call it in `beforeEach` of the demo-clock test suite.

---

### A5 — ClockProvider propagation: login path frozen even for unauthenticated users [LOW]

**File:** `app/layout.tsx:109-115`
**Class:** frozen-too-much (over-broad freezing)
**Severity:** LOW
**What would break:** In DEMO_MODE, the `ClockProvider` with `frozenMs` is applied to ALL children including the `/login` page. Login page does not display freshness-dependent data, but if any component within the unauthenticated shell ever calls `useDemoNow()`, it will receive the frozen timestamp rather than live time. Not a security risk; cosmetic at worst.
**Test approach:** Verify that the login page renders without any clock-dependent display artifacts. Snapshot test or DOM check.

---

### A6 — Demo mode + DB missing: demoNow silently falls to hardcoded 2026-05-28 [LOW]

**File:** `lib/clock.ts:42-49`
**Class:** wrong boundary (silent fallback)
**Severity:** LOW
**What would break:** If `demo_seed_meta` is missing (e.g. fresh deploy without running seed script) AND `DEMO_CLOCK` is not set, `demoNow()` silently returns `2026-05-28T12:00:00.000Z`. This could confuse operators who changed the seed date but forgot to set the env var. No user-visible bug, but the hardcoded default could diverge from the actual seed.
**Test approach:** Existing test T3 covers this case (PASS). Consider adding a warning log when falling through to the hardcoded default.

---

## Summary table

| ID | File | Risk class | Severity | Test approach |
|----|------|-----------|----------|---------------|
| A1 | MatchesClient.tsx:67 (formatAge dead) | frozen-too-little | LOW | Static dead-code check; activate with clientNow param if used |
| A2 | fmt-laycan.ts:18 (nowSec optional) | frozen-too-little | MED | Audit call-sites; add explicit nowSec pass requirement |
| A3 | demo-clock.test.ts (missing session-expiry test) | deny-list contamination | HIGH | Add SAFETY-CRITICAL test for SessionStore expires_at vs real clock |
| A4 | demo-mode.ts (cache not reset in tests) | SSR mismatch | LOW | beforeEach _resetDemoFrozenDateCache |
| A5 | layout.tsx (ClockProvider on login path) | frozen-too-much | LOW | Snapshot/DOM test for login page |
| A6 | clock.ts (hardcoded fallback) | wrong boundary | LOW | Existing T3 covers; add operator warning log |

## Verdict

**CONDITIONAL PASS** — no correctness bugs in the shipped runtime code (deny-list clean, allow-list fully wired). One HIGH gap in test coverage (A3 — safety-critical session-store test mandated by the plan but absent). Two MED risks (A2 dead-code, A3 coverage). Must add A3 test before merge.

---

# PREVIOUS REVIEW (attack plans from prior PRs below this line)


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
