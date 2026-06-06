# Wave A1 — Matches list DISPLAY fixes (#785, #786, #788)

**Branch off `origin/main`** (these files live on `main`, NOT the bunker branch). Part of the 2026-06-03 QA-matches program (see `2026-06-03-qa-matches-fix-program.md`). Display-only, mechanical. Tier M.

## Goal

Make every match in the `/matches` LIST _look_ right — readable ports, a real vessel name (never a raw hash), English-only chrome. The underlying data/engine is correct; only the list display mangles it. Validated on live prod (28 main rows: vessel_name NULL 28/28, real ports in DB, RU literals present).

## Scope (3 findings)

### #785 — `abbrPort` mangles real ports (`Thisvi→THIS`)

- Root: `lib/utils/abbr-port.ts:22` truncates any single-word port to 4 chars UPPER; applied only in the table Route cell `app/matches/MatchesClient.tsx:1046,1048`. Detail + cards already show full names.
- Fix: render the **full readable port name** in the list Route cell (match the cards/detail behavior) — drop the `abbrPort` truncation for real names. If keeping `abbrPort` for genuine UNLOCODE/qualified strings, make it return the full name when the input is a plain proper name (no truncation). Lowest blast radius = fix at the call site (`MatchesClient.tsx:1046,1048`). Verify no other consumer depends on the 4-char output (`grep -rn abbrPort`).

### #786 — Raw hash shown as vessel name (`19e07d815dd6691c`)

- Root: list renders `match.vessel_name ?? match.vessel_id` where `vessel_id` is the gmail hash; seed has NULL names (resolved at hydration, one row misses).
- Fix: never expose the raw id. Replace the fallback with a human placeholder (`'TBN'` — "to be named", standard chartering term) when `vessel_name` is null/empty, at: `MatchesClient.tsx:1036,1038` (+ owner-mode `:1071,1073`), `vesselInitials()` `:58`, and detail `app/match/[id]/page.tsx:139,175` for consistency. (Deeper "why does hydration resolution miss" → out-of-scope, handled in the seed wave C5.)

### #788 — Russian on English-only demo + comma decimals

- No i18n system — hardcoded literals. Swap to English (do NOT wire i18n):
  - Tabs `MatchesClient.tsx:380` «Матчи»→`Matches`, `:381` «На проверку»→`Needs review`, `:382` «Мало данных»→`Insufficient data`.
  - `EconomicsTab.tsx:483` «Бункеровка — сравнение портов»→`Bunkering — port comparison`.
  - `components/economics/BunkerComparisonTable.tsx` — 16 RU strings (lines ~68,71,76,89–95,114,153,162,164,165,166). Use the English suggestions in the program doc's i18n table.
- Comma decimals (`21,56`): bare `.toLocaleString()` resolves to the prod server locale. Pin to `'en-US'` or route through existing `formatNumber()` (`lib/utils.ts:54`) at the ~12 bare sites: `BunkerComparisonTable.tsx:68,71`; `EconomicsTab.tsx:382,558,564,570,576`; `MatchWorksheet.tsx:67,68,75`; `SourceTable.tsx:159`; `laytime/page.tsx:472,473`; `match/[id]/page.tsx:106`.
- **Test guard**: `__tests__/matches-buckets.test.tsx:130` asserts `/Матчи/` — update it to the new English label (this is a label change the test must follow, NOT bending a test to hide a bug).

## Out of scope (other waves — do NOT touch)

- Laycan ms↔s unit contract (#665) → Wave A2.
- Render-side fit≥60 floor (#789) + content-dedup (#787) → Wave A2.
- Economics TCE / fit / gates (#782/#783/#784) → Track C.
- Seed regeneration + the vessel-name hydration-resolution miss → Wave C5.
- Do NOT touch the Fit-Breakdown surface, transit math, or economics constants (verified working).

## Verification (required before PR)

1. `npm test` (jest) green, incl. the updated buckets test.
2. `npx tsc --noEmit` clean.
3. `grep -rn "Матчи\|Бункеровка\|toLocaleString()" components/ app/` → no remaining RU literals on the touched surfaces, no bare `.toLocaleString()` on the listed sites.
4. Preview `/matches` (list table) + one `/match/[id]` Economics tab: ports readable, no hash names, English chrome, `.` decimals.
5. `git status --porcelain` clean (no untracked files left).

## Notes

- Auto PR → main when QA green (Rule #5). UI PR → orchestrator runs Gate 3 preview before merge.
- Cold `/test-skill` is light here (display-only) but run it — emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
