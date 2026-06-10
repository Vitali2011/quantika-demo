# test-skill findings — 2026-06-09 (Round 2)

## Round 1 Followups — Verified Fixed

### ✓ FIXED: H1 — fit_breakdown economics component now uses live TCE
- PR #878: patchEconomicsComponent() replaces only economics component with scoreEconomics(liveTce, dwt)
- Browser: Passport TCE = Header TCE (delta=0 on tested matches: $2,230, $27,152)
- Economics penalty working: avg fit% neg-TCE (60%) < avg fit% pos-TCE (70%)
- Regression: 140/140 tests pass

### ✓ FIXED: M1 — CalculationWaterfall duration shown 1dp
- PR #877: `duration_days.toFixed(1)` in duration-days row and bunker-caption
- Browser (match/54117): "÷ Длина рейса **7.2 дней**", bunker caption "· **7.2 дн** ·" — no raw float
- Regression: 140/140 tests pass

### ✓ FIXED: M2 — waterfall war-risk math reconciliation
- PR #877: "Чистыми для TCE" addback row renders when war_risk_usd > 0
- Code fix correct: `{war_risk_usd > 0 && (<div data-testid="tce-basis-addback">...)}`
- Browser unverifiable: no HRA routes with war_risk>0 in demo seed (all 73 matches have war_risk_usd=0)
- Regression: 140/140 tests pass

### ✓ FIXED: L1 — no $-0 in CalculationWaterfall
- PR #877: `fmtUsd` guards `n === 0 → '$0'`
- Browser: strict $-0 absent on all tested pages (matches list + 4 match detail pages)
- Regression: 140/140 tests pass

## Findings (gate-relevant, introduced by recent changes)
**NONE**

## Fresh Sweep — No New Issues
- /matches list: 73 matches, body 6418 chars, 0 console errors, 0 hydration errors
- Fit% values: [86, 82, 82, 81, 80, 80, 79, 76] — reasonable spread for top matches
- Vetting badges: PSC=35 HTML refs, charterer=110 (demo banners) — present
- Dashboard (/dashboard): functional, body 1395 chars
- Match detail (/match/[id]): Economics + Passport tabs functional
- Deployed version: confirmed `sentry-release=24fb6917` (correct)

## Pre-existing Issues (informational, do not affect gate)
### B18e (pre-existing): fmtTce sign format
- File: app/matches/MatchesClient.tsx:80-83
- `fmtTce(-800)` → `$-0.8k` (should be `-$0.8k`); small negatives: `$-0.0k`
- Last modified: commit b548d034 (PR #873, 2026-06-07), NOT introduced by #877/#878
- Documented in BUGFIX-HANDOFF-2026-06-05.md as B18e
- Gate impact: none (pre-existing, not a regression)

## Browser E2E Gate
PASS — 0 console errors, 0 hydration errors
All pages functional. Screenshots: /tmp/pw-final-matches.png, /tmp/pw-wf-54117.png, /tmp/pw-pp-54117.png, /tmp/pw-neg-tce-passport.png

## Verdict
APPROVE
