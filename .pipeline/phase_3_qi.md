# Phase 3 — QI Review: Coverage Backfill (11 API Routes)

**Date:** 2026-05-18
**Reviewer:** Independent Sonnet QA Agent (adversarial, cold-start)
**Branch:** `coverage-backfill`
**Verdict:** BLOCK — 2 HIGH findings must be remediated before Phase 4

---

## Verdict Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 3 |

**BLOCK reason:** 2 HIGH findings prevent Phase 4 delivery.

---

## HIGH Findings (must fix before merge)

### HIGH-1: session.test.ts — Cookie deletion not behaviorally verified
**File:** `__tests__/api/session.test.ts:54-56`
**Class:** 9 (E2E behavioral verification)

The test checks `setCookie` contains `'session_id'` — this is trivially satisfied even if the cookie is being SET (not cleared). The production route uses `response.cookies.delete('session_id')` which sets `Max-Age=0`. The test never asserts this.

**Remediation:** Add `expect(setCookie).toMatch(/Max-Age=0/i)` (or the `Expires` epoch equivalent) to the existing Set-Cookie test.

---

### HIGH-2: audit.test.ts — GET happy path (200) is completely absent
**File:** `__tests__/api/audit.test.ts:39-78`
**Class:** 9 (E2E behavioral verification)

The GET suite covers only error paths: 401 (no auth), 400 (no params), 403 (wrong sessionId). Neither the `inquiryId` 200 path nor the `sessionId` 200 path is tested. The primary contract of the route — returning audit events — is dark.

**Remediation:**
1. Add test: seed an event via `logAuditEvent({ sessionId: OWN_SESSION_ID, actor: 'user', action: 'confirmed' })`, then `GET ?sessionId=OWN_SESSION_ID`, expect 200 with `json.events` array length >= 1.
2. Add test: seed an event with `inquiryId: 'inq-001'`, then `GET ?inquiryId=inq-001`, expect 200 with events.

---

## MEDIUM Findings (recommended before merge)

### MEDIUM-1: audit.test.ts — POST no-auth path untested
**File:** `__tests__/api/audit.test.ts:80-122`

`requireSession` returning 401 on POST is never tested. CSRF fires first, but if CSRF passes, a missing session should block — this branch is dark.

**Remediation:** Add test mocking `requireSession` to return `NextResponse.json({error:'No session'},{status:401})` on POST.

---

### MEDIUM-2: canal.test.ts — Suez 200 happy path missing
**File:** `__tests__/api/canal.test.ts:38-45`
**Class:** 9

The Suez branch calls `quoteCanal('suez', {...})`. Only the error path (missing `vessel_nt`) is tested. The success path through `quoteCanal` is dark.

**Remediation:** Add: `GET /api/canal/suez?vessel_dwt=50000&vessel_type=tanker&vessel_nt=30000` → expect 200, at least one numeric field.

---

### MEDIUM-3: canal.test.ts — Non-finite vessel_dwt untested (Class 2)
**File:** `__tests__/api/canal.test.ts:20-27`
**Class:** 2 (NaN/non-finite)

`parsePositiveFinite('abc', ...)` returns null → 400. This case is not exercised.

**Remediation:** Add: `vessel_dwt=abc` → expect 400, error matching `/finite positive/i`.

---

### MEDIUM-4: port-da.test.ts — Zero vessel_dwt untested (Class 3)
**File:** `__tests__/api/port-da.test.ts:43-50`
**Class:** 3 (negative/zero boundary)

Route returns 400 for `vesselDwt <= 0`. `vessel_dwt=0` is not tested.

**Remediation:** Add: `vessel_dwt=0` → expect 400 with error matching `/positive integer/i`.

---

### MEDIUM-5: port-da.test.ts — Float vessel_dwt untested (Class 2)
**File:** `__tests__/api/port-da.test.ts:43-50`
**Class:** 2 (non-integer / NaN boundary)

Route checks `Number.isInteger(vesselDwt)`. `vessel_dwt=12345.5` is not tested.

**Remediation:** Add: `vessel_dwt=12345.5` → expect 400 with error matching `/positive integer/i`.

---

## LOW Findings (follow-up, non-blocking)

### LOW-1: economics.test.ts — In-process cache not tested
**File:** `__tests__/api/economics.test.ts:74-91`

The 15-minute `Map` cache is a meaningful production behavior (avoids redundant compute). It is never tested. Same request twice should call `computeEconomics` exactly once. _(Note: `computeEconomics` in `lib/economics/index.ts` removed in Wave 2 dead-code purge — this LOW finding is no longer applicable.)_

---

### LOW-2: economics.test.ts — Missing `route.toPort` not tested separately
**File:** `__tests__/api/economics.test.ts:37-54`

Only `fromPort`-missing is tested. The `toPort`-missing branch is symmetric but dark.

---

### LOW-3: health-root.test.ts — Version assertion is brittle
**File:** `__tests__/api/health-root.test.ts:35-40`

`expect(json.version).toBe('0.1.0')` — hardcoded version creates a test that breaks on any version bump. Replace with type + format assertion.

---

## Per-file Summary

| File | Verdict | Key Issues |
|---|---|---|
| `upload-csv.test.ts` | PASS | Solid 9-class coverage, E2E, idempotency |
| `audit.test.ts` | BLOCK | HIGH-2: 200 path absent; MEDIUM-1: POST no-auth |
| `logout.test.ts` | PASS | Status, cookie clearing, location all verified |
| `canal.test.ts` | MEDIUM | Missing Suez 200 path; missing NaN vessel_dwt |
| `demo-scenarios.test.ts` | PASS | 404 + 200 for two known IDs |
| `economics.test.ts` | LOW | Cache untested; toPort missing case absent |
| `extension-context.test.ts` | PASS | 401, empty session, happy path, messageId filter |
| `health-root.test.ts` | LOW | Brittle version assertion |
| `market-tmi.test.ts` | PASS | Empty DB, seeded, wrong index_name filter |
| `port-da.test.ts` | MEDIUM | Missing zero and float vessel_dwt |
| `session.test.ts` | BLOCK | HIGH-1: cookie deletion semantics not verified |

---

## Gate

**BLOCK** — Remediate HIGH-1 and HIGH-2 before Phase 4. MEDIUM findings are strongly recommended.
After fixes, re-run QI for clearance.
