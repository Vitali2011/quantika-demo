# discovery.md — PR fix/demo-freshness-clock adversarial QA (2026-06-01)
# Reviewer: cold-session test-skill (zero feature-session context)

---

## Branch commit (relevant to this review)

```
b46020cc feat(clock): freeze demo-freshness clocks to seed frozen_date via demoNow()
```

## Changed files (clock-feature scope — filtered from 438-file diff)

| File | Role |
|------|------|
| `lib/clock.ts` | NEW — server-side demoNow() + now() + today() |
| `lib/clock-client.tsx` | NEW — ClockProvider + useDemoNow() hook |
| `app/layout.tsx` | MODIFIED — wraps both render paths with ClockProvider |
| `lib/classification-service.ts` | MODIFIED — daysWithoutReply uses demoNow() |
| `app/matches/MatchesClient.tsx` | MODIFIED — clientNow via useDemoNow(); isFreshMatch/effectiveScore |
| `app/market/page.tsx` | MODIFIED — staleness `now` via useDemoNow() |
| `__tests__/demo-clock.test.ts` | NEW — behavioral tests for demoNow() |

## Deny-list files (verified NOT touched by this clock feature)

| File | demoNow imported? | Verdict |
|------|-------------------|---------|
| `lib/session-store.ts` | No | CLEAN — all Date.now() calls at L109, L139, L191 remain real-time |
| `lib/trial.ts` | No | CLEAN — new Date() at L36, L37, L72, L76/84 remain real-time |
| `lib/currency.ts` | No | CLEAN — Date.now() cache TTL at L45 remains real-time |

## Allow-list wiring status (per plan docs/superpowers/plans/2026-06-01-demo-clock.md)

| Plan item | File | Wired? | Notes |
|-----------|------|--------|-------|
| 1. MatchesClient clientNow | `app/matches/MatchesClient.tsx:145` | YES | useDemoNow() → isFreshMatch(m, clientNow) + effectiveScore(m, clientNow) |
| 2. market staleness now | `app/market/page.tsx:111` | YES | useDemoNow(); isStale guard: `now > 0 &&` |
| 3. fmt-laycan isLaycanExpired | `lib/utils/fmt-laycan.ts:18` | PARTIAL | nowSec param optional; callers in MatchesClient pass Math.floor(clientNow/1000). Direct callers without nowSec fall back to Date.now() |
| 4. classification-service email-age | `lib/classification-service.ts:51` | YES | demoNow() used directly |
| 5. readiness verdict now | `lib/sailing/readiness-gap.ts:172-173` | YES | opts.today ?? now() — now() from clock.ts |
| 6. vetting refYear | `lib/matching/pair-analyzer.ts:235` | YES | today = options?.today ?? now(); refYear from today |
| 7. recent-fixtures 24h | `components/market/FixturesSection.tsx` | N/A | Hardcoded static rows; no clock dependency |

## Raw issues found

### I1 — formatAge uses raw Date.now() [DEAD CODE]

`app/matches/MatchesClient.tsx:67`: `formatAge` is defined but grep shows only 1 occurrence (the definition). It is never called in the render path. Dead code. Not a runtime bug since it never executes.

```ts
function formatAge(ts: number): string {
  const diff = Date.now() / 1000 - ts;  // raw Date.now() — NOT demo-frozen
  ...
}
```

### I2 — isLaycanExpired default fallback is Date.now()

`lib/utils/fmt-laycan.ts:18`: `const now = nowSec ?? Math.floor(Date.now() / 1000);`

The optional `nowSec` param means any caller that omits it silently uses real wall-clock time. MatchesClient correctly passes `Math.floor(clientNow/1000)`. But if any future server-side caller adds a call without `nowSec`, it leaks real time in demo mode.

### I3 — Safety-critical gap: no test verifying session-store uses real time

`__tests__/demo-clock.test.ts` only checks that `clock.ts` does NOT EXPORT `getSessionExpiry` / `cleanupExpiredSessions`. It does NOT:
- Import SessionStore and verify `expires_at < Date.now()` (not frozen)
- Confirm that `session.getSession()` with a real-time expiry correctly expires
- Confirm that `createSession()` sets `expires_at` relative to real Date.now(), not demoNow()

The plan mandates: "Test (SAFETY-CRITICAL): a login session STILL expires on REAL time (session-store NOT frozen)." This test is **absent**.

### I4 — getDemoFrozenDate module-level cache not reset in tests

`lib/demo-mode.ts:12-21`: `_cachedFrozenDate` is module-level. The demo-clock test file does NOT import `_resetDemoFrozenDateCache`. However, in the test environment getDemoFrozenDate throws (no DB) so the cache stays null and tests pass correctly. Latent fragility: if Jest reuses the module across suites and another test populates the cache, the fallback path (DEMO_CLOCK / hardcoded) is never exercised.

### I5 — ClockProvider wraps unauthenticated path (login page) in demo mode

`app/layout.tsx:112`: The unauthenticated render path wraps `{children}` in `<ClockProvider frozenMs={frozenMs}>`. `frozenMs` is computed via `demoNow()` which internally catches the throw from `getDemoFrozenDate` when DB row is absent, falling back to env/hardcoded. Safe, but worth noting.

### I6 — Non-demo mode: useDemoNow returns 0 before mount (SSR sentinel)

`lib/clock-client.tsx:31`: Returns 0 on SSR. All callers guard `=== 0`:
- `isFreshMatch`: `if (now === 0) return false` — correct
- `effectiveScore`: `if (nowMs === 0) return m.score` — correct
- market `isStale`: `now > 0 &&` guard — correct

No SSR mismatch risk found for the guarded paths.

### I7 — market page: .at(0) after .sort() picks oldest date

`app/market/page.tsx:214-215`: The comment says "Use the OLDEST date across all sources" and `.sort().at(0)` gives the lexicographically smallest (oldest) date string. Correct per design intent ("if any source is stale the label should reflect it"). Not a bug.

---

# PREVIOUS REVIEW (PR #8 — wave-alpha, 2026-04-28 — unrelated)

**Mode:** post-merge (PR already merged; treats `8821b12..4387573` as the review range)

---

## Commit inventory

100 commits merged via PR #8. Key merge commits (sub-waves):

| Sub-wave | Merge commit | Specs |
|---|---|---|
| Wave 0 | `219ef18`, `26a71e4` | 00a-breakbulk-sample-data, 00b-fix-dead-cargotype-tests |
| Wave 1 | `531e47e` | 01-types-and-interfaces, 02-confidence-engine, 03-audit-trail |
| Wave 2 | `0447ff2`, `d98beb5`, `1c3b9c1`, `01dc08e` | 04-whatsapp-infra, 05-gmail-extension-base |
| Wave 3 | `55948a8`, `9a8d607`, `1d32232` | 07-dashboard-morning-view, 08-economics-engine, 09-whatsapp-onboarding-digest |
| Wave 4 | `eae7c15`, `2a5b49e`, `6bd1236`, `06e2def` | 10-whatsapp-forward-anything, 11-vessel-passport-upgrade, 12-gmail-ghost-text-sidebar, 13-source-attribution-rtl |
| Spec 14-15 | `a5d95ef`, `b408a0c` | 14-market-benchmark, 15-trial-onboarding |

3 specs required manual merge after wave-pipeline resume bug: #10, #11, #13.

---

## Files changed (summary)

`git diff 8821b12..4387573 --stat`: 159 files, +12,990 / -2,819 lines

**New directories:**
- `lib/economics/` — bunker, ETS, war-risk, split-bunker calculators
- `lib/sanctions/` — IACS, P&I clubs, Paris MoU, OpenSanctions, shadow-fleet
- `lib/whatsapp/` — client, router, forward-parser, image-ocr, voice-transcribe, pdf-extract, onboarding, digest
- `lib/market/` — Toepfer TMI scraper, benchmark service
- `lib/onboarding/` — demo-seed, activation-tracker
- `lib/i18n/` — RTL detection
- `extensions/gmail/` — Manifest v3 Chrome extension

**New API routes:** 8 routes (audit, economics, whatsapp/webhook, whatsapp/ingest, extension/context, extension/draft, market/benchmark, onboarding/demo-data)

**New migrations:** 6 new (002–007); collision fix for 005→007 opensanctions.

---

## Existing test coverage (pre-attack-skill)

+301 new tests (1048 → 1349). 44 new test suites covering:
- `lib/__tests__/confidence.test.ts` — confidence engine (basic happy path)
- `lib/__tests__/whatsapp-signature.test.ts` — webhook signature (basic)
- `lib/__tests__/economics.test.ts` — economics aggregator
- `lib/__tests__/sanctions.test.ts` — shadow fleet
- `lib/__tests__/trial.test.ts` — trial lifecycle
- `lib/__tests__/rtl-detect.test.ts` — RTL detection

---

## Known issues from retro

1. Migration collision — 005-market-benchmarks vs 007-opensanctions-cache (fixed in `7df9f2b`)
2. Pipeline resume bug — 3 manual merges required post-pause
3. ScheduleWakeup unreliable (wave-pipeline infra issue, not app code)

---

## Spec files present

27 spec files in `.specs/` — 15 alpha specs plus earlier v0.3 specs.  
All 15 alpha specs confirmed present and readable.

---

## Attack surface signal (preview for Phase 2)

Files requiring adversarial attention:
- `lib/whatsapp/signature.ts` — HMAC auth (security-critical)
- `lib/confidence.ts` — `blockSend` gate (correctness-critical)
- `lib/economics/ets.ts` + `bunker.ts` + `war-risk.ts` — financial calculators
- `lib/whatsapp/forward-parser.ts` — external input handler
- `lib/i18n/rtl-detect.ts` — Unicode normalizer
- `lib/trial.ts` — business logic / expiry gate
- `lib/sanctions/opensanctions.ts` — external API + cache
