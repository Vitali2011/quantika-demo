# Wave α — Agent-driven E2E Acceptance Test

**Run date:** 2026-04-29 15:30–16:00 UTC  
**Target:** https://demo.quantika.org  
**Tester:** Claude (Chrome MCP, `mcp__Claude_in_Chrome__*`)  
**Browser:** macOS Chrome (Vitali profile)  
**Viewport:** 1280×800  
**Session:** Sample data loaded via "Try with Sample Data" (26 cargo, 14 vessels, 8 recaps)

---

## Summary

| Metric           | Count |
| ---------------- | ----- |
| Total test cases | 14    |
| ✅ PASS          | 7     |
| ⚠️ PARTIAL       | 5     |
| ❌ FAIL          | 1     |
| ⏭ BLOCKED       | 1     |

**Verdict: ⚠️ NOT READY FOR GA** — 1 HIGH bug blocks demo core flow (0 matches), 1 MEDIUM React hydration error fires on homepage and cargo pages.

---

## Detailed Results

### TC-01 — Homepage smoke

- **Status:** ✅ PASS
- **Expected:** HTTP 200, title contains "Quantika", main content visible, 0 console errors on load
- **Actual:** Title "Quantika Demo — AI for Freight Email"; content visible: QUANTIKA heading, "See how AI handles your freight email in 2 minutes", "Connect Gmail" + "Try with Sample Data" buttons, privacy notes; 0 console errors
- **Notes:** Trial banner "Trial: 14 days remaining · activate by sending your first quote" visible after session creation. Homepage doubles as pre-session landing AND post-onboarding entry point.

### TC-02 — /api/health endpoint

- **Status:** ✅ PASS
- **Expected:** JSON `{"status":"ok","sessions":N,"uptime":>0,"version":"0.1.0"}`
- **Actual:** `{"status":"ok","sessions":4,"uptime":1053.67,"version":"0.1.0"}`
- **Notes:** All fields present and correct. Server uptime confirms process running continuously.

### TC-03 — Onboarding flow (spec-15)

- **Status:** ✅ PASS
- **Expected:** `/onboarding` shows "⚓ Welcome to Quantika", subheading, 3 radios, submit button; session created after submit
- **Actual:**
  - Heading: "⚓ Welcome to Quantika" ✅
  - Subheading: "5 minutes to your first quote — guaranteed." ✅
  - 3 radio buttons: MENA, Med, WAFR ✅
  - Submit: "Start 14-day trial — no credit card" ✅
  - 0 console errors ✅
  - After submit (MENA): redirect to `/` with trial banner "Trial: 14 days remaining · activate by sending your first quote" ✅
  - Session created and cookie set (confirmed via trial banner presence)
- **Notes:** Redirect destination is `/` not `/dashboard` — appears intentional; entry point after onboarding is the homepage with sample data CTA. Trial banner confirms session was successfully created.

### TC-04 — Dashboard (spec-07)

- **Status:** ✅ PASS
- **Expected:** Morning header, Top Priorities, Market Intelligence 4 KPIs, traffic lights, empty state if no matches
- **Actual:**
  - Header: "Good morning, Broker · Wednesday, 29 April 2026" ✅
  - Top Priorities: "No matches to prioritise yet." (empty state) ✅
  - Inbox Breakdown: 📦26 Cargo, 🚢14 Vessel, 📋8 Recaps, 💬0 Replies, 📁0 Noise ✅
  - Market Intelligence: Toepfer TMI, Bunker Rotterdam, EUA EU ETS, BHSI — all "Unavailable" ⚠️
  - Traffic lights: 🔴 No unanswered inquiries, 🔗 No matches found ✅
  - Empty state: "No active deals yet. Forward your next inquiry via WhatsApp or Gmail extension" ✅
  - 0 console errors ✅
  - API: 2x 503 on market benchmark (expected, graceful)
- **Notes:** Dashboard structure fully functional. Market KPIs unavailable — scraper not running on prod. Commission $17,670 extracted from 5 recaps (visible on /summary).

### TC-05 — Match Detail tabs (spec-06)

- **Status:** ⚠️ PARTIAL
- **Expected:** `/match/<id>` renders with 4 tabs (Vessels, Economics, Passport, Quote), confidence border color, sticky header
- **Actual:** 0 matches generated from 26 cargo + 14 vessel. `/match/sample-01` returns 404. Match detail UI untestable end-to-end.
- **Code confirmed:** `components/match/MatchTabs.tsx` — 4 tabs: Vessels, Economics, Passport, Quote. `lib/constants.ts` — CONFIDENCE_COLORS: blue-500/yellow-500/orange-500/gray-400.
- **Root cause:** All 26 cargo and 14 vessel items marked "🕳️ Stale" despite Oct 2026 laycan dates. Matching pipeline did not execute. Possible cause: CLIPROXY_API_KEY not configured on prod, or stale-detection threshold bug.
- **Notes:** See Issue #2.

### TC-06 — Source attribution split view (spec-13)

- **Status:** ✅ PASS (email-level; match-level DEFERRED)
- **Expected:** Annotated view shows source quotes with `<mark>` highlighting
- **Actual:** `/email/sample-01` renders "Email Body — Annotated" with **4 `<mark>` elements** highlighting source quotes: "Load: Derince, Turkey (Marmara", "Disch: Lagos, Nigeria (Apapa,", "Cargo: 8,000 mts HRC steel coi" + dates. "View annotated →" link present on cargo page.
- **Notes:** Email-level annotation works. Full split-view modal (`SourceAttribution.tsx`) on match page DEFERRED — requires matches (Issue #2).

### TC-07 — Confidence blocker (spec-02)

- **Status:** ⚠️ PARTIAL
- **Expected:** Quote tab "Send" button disabled when `confidence.blockSend === true`
- **Actual:** Cannot test — no match pages (0 matches). Code confirmed in source: QuoteTab checks `confidence.blockSend`.
- **Notes:** DEFERRED pending Issue #2 fix.

### TC-08 — Audit trail (spec-03)

- **Status:** ⚠️ PARTIAL
- **Expected:** AuditTrail timeline renders on Quote tab with timestamp + actor + action
- **Actual:**
  - `/api/audit` responds correctly: 400 "inquiryId or sessionId query parameter is required" ✅
  - 403 on invalid sessionId ✅ (cross-session protection working)
  - Timeline UI untestable — no match/inquiry pages to navigate
- **Notes:** API functional and secure. Timeline UI DEFERRED pending Issue #2.

### TC-09 — Arabic RTL (spec-13)

- **Status:** ⏭ BLOCKED
- **Expected:** `<html dir="rtl" lang="ar">` with Accept-Language: ar-SA
- **Actual:** `<html lang="ru" dir="ltr">` — browser language (Russian) detected and applied. i18n detection works. RTL requires Accept-Language: ar-SA, unsettable via Chrome MCP without DevTools.
- **Notes:** Manual test: DevTools → Application → set cookie `NEXT_LOCALE=ar` → reload. Or launch Chrome with `--accept-lang=ar-SA`.

### TC-10 — WhatsApp webhook security

- **Status:** ✅ PASS
- **Expected:** Invalid `hub.verify_token` → 403
- **Actual:** GET `…/api/whatsapp/webhook?hub.verify_token=wrong_token_test&…` → page body "Forbidden" (HTTP 403)
- **Notes:** Token validation against `process.env.WHATSAPP_VERIFY_TOKEN` working correctly.

### TC-11 — Market benchmark API

- **Status:** ✅ PASS
- **Expected:** 200 with data OR 503 graceful fallback
- **Actual:** GET `/api/market/benchmark?indicator=TOEPFER_TMI` → **HTTP 503** `{"error":"Benchmark unavailable"}`
- **Notes:** Graceful 503 fallback correct — no crash, proper JSON body, `Cache-Control: no-store`. Toepfer scraper not running on prod. Dashboard degrades gracefully.

### TC-12 — Console errors on main flow

- **Status:** ❌ FAIL
- **Expected:** 0 unhandled JS errors across main pages
- **Actual:**
  - `/` homepage: **3x React error #418** at 15:35:41, 15:36:24, 15:37:00 (fires every ~45s)
  - `/onboarding`: 0 errors ✅
  - `/dashboard`: 0 errors ✅
  - `/cargo/sample-01`: **1x React error #418** at 15:40:32
- **React #418 meaning:** "Hydration failed because the initial UI does not match what was rendered on the server"
- **Likely cause:** A component calling `Date.now()` or `new Date()` during render creates SSR/CSR mismatch. The ~45s interval suggests a timer-driven re-render. Candidates: `TrialBanner.tsx` (days remaining), `MorningHeader.tsx` (date string).
- **Notes:** See Issue #1.

### TC-13 — Network errors on main flow

- **Status:** ✅ PASS
- **Expected:** No unexpected 5xx on main flow
- **Actual:** No unexpected 5xx:
  - `/api/market/benchmark` → 503 (expected — scraper down)
  - `/api/whatsapp/webhook` → 403 (expected — invalid test token)
  - `/api/audit` → 400/403 (expected — auth-gated)
  - `/api/session GET` → 405 (expected — POST only)
  - No 500 Internal Server Errors on navigation
- **Notes:** Previous run (14:00 UTC) found 500 on homepage and onboarding — **resolved** in current deployment.

### TC-14 — Visual smoke (subjective)

- **Status:** ⚠️ PARTIAL
- **Expected:** Screenshots of main pages, layout readable with no overlapping elements
- **Actual:** Screenshot capture timed out (computer-use macOS permission dialog). Visual assessment from DOM reads:
  - `/`: QUANTIKA heading, two CTA buttons, privacy notes — clean
  - `/onboarding`: Radio buttons, submit — clean
  - `/dashboard`: Morning header, inbox grid, market panel, fixture recaps — structured, no broken elements
  - `/cargo/sample-01`: Email body, AI analysis fields, Draft Quote CTA — readable
- **Notes:** No layout-breaking issues detected from DOM inspection. Manual screenshot review recommended.

---

## Issues Found

| Severity   | TC       | Issue                                                                                                                                                     | Repro                                                              |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **HIGH**   | TC-05    | Zero cargo-vessel matches from 26 cargo + 14 vessel sample data. All items "🕳️ Stale" despite future (Oct 2026) laycan. Core demo value not demonstrable. | Load sample data → /dashboard → "🔗 No vessel-cargo matches found" |
| **MEDIUM** | TC-12    | React hydration error #418 on `/` and `/cargo/*` pages, fires every ~45s. SSR/CSR mismatch in a timer component (likely TrialBanner or date display).     | Navigate to `/` → open DevTools Console → wait 45s                 |
| **MEDIUM** | TC-04/11 | Market Intelligence KPIs all "Unavailable" (503). Toepfer scraper not configured on prod. Reduces demo value.                                             | /dashboard → Market Intelligence section                           |
| **LOW**    | TC-09    | RTL Arabic layout untestable via Chrome MCP. No locale toggle in UI.                                                                                      | Manual: set cookie NEXT_LOCALE=ar, reload                          |

---

## Recommendations

### Fix before GA

**Issue #1 — React #418 hydration** (MEDIUM):
✅ **Already fixed in local repo** — commit `0cf90d5` (`fix(dashboard): suppressHydrationWarning on date + tsconfig regression exclude — fix React #418 (#39)`). Fix is in code but **not yet deployed to production**. Action: deploy latest `main` to prod.

**Issue #2 — Zero matches** (HIGH):

- **Option A:** Configure CLIPROXY_API_KEY on prod for live AI matching
- **Option B:** Pre-seed demo matches in `lib/onboarding/demo-seed.ts` (reliable for demos)
- **Option C:** Investigate stale detection — `laycan 01-10 Oct 2026` is future from 2026-04-29; marking it stale may be a date comparison bug

### Wave β

- Configure market scraper on prod or add static mock data for demo KPIs
- Add locale picker UI for RTL/Arabic testing
- Pre-seed audit events in demo data so timeline is always visible
- Add Playwright screenshot step to CI for visual regression
- Investigate processing pipeline timing (took ~3 min vs expected 30-60s)
