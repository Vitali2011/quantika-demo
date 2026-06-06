# Wave A2 — Laycan unit + render-side floor/dedup (#665, #789, #787)

**Branch off `origin/main`** (now has A1 #794 + B #795). Tier **M**, **risk-override** (date normalizer + list filter) → mandatory `/test-skill` real shapes. Reader-side only — NO seed scripts (avoids conflict with C4/C5). Part of the 2026-06-03 QA program.

## Goal

Three list-integrity fixes so the board shows correct dates and only real, strong, unique matches.

### #665 / H5 / L1 — laycan dates wrong (Apr 25–Jan 1 backwards)

- Root: laycan stored in **ms** everywhere; the sole reader `lib/utils/fmt-laycan.ts:4` does `new Date(ts*1000)` (treats as **seconds**) → dates blow up. `created_at` has the MIRROR bug (stored ms via `Date.now()` at `matches-repository.ts:115`, read as seconds at `MatchesClient.tsx:78`); `isLaycanExpired` called with `Math.floor(now/1000)` (s) against ms laycan (`MatchesClient.tsx:77,86`).
- Fix: **canonical unit = milliseconds** (DB already stores ms; do NOT touch the 5 write sites — that keeps this wave off the seed scripts). Fix the READERS to treat values as ms, coherently across **all** of: `fmt-laycan.ts` (drop `*1000`), `isLaycanExpired`, `isFreshMatch`, `effectiveScore`, and the `created_at` freshness math in `MatchesClient.tsx` (use `Date.now() - m.created_at` in ms, not `/1000`). One coherent decision — grep every reader of laycan_start/end + created_at first.

### #789 / H10 — sub-60 fit on main board (floor not applied)

- Root: the fit≥60 floor lives only in the seed-build script (doesn't run on prod); the render path has no floor.
- Fix: add a render-side filter on the main «Matches» tab — `fit_percent >= 60` (the weaker matches already have their review/insufficient buckets). Defense-in-depth so served data can't bypass the floor. Touch `app/matches/MatchesClient.tsx` (and/or `app/matches/page.tsx`).

### #787 / H8 — duplicate match (SEAGULL 48 ×2)

- Root: render-side content-dedup (#723) was added to cargo/vessels pages but NOT the matches page; live list has no content-dedup.
- Fix: add a content-dedup pass on the matches list (mirror the #723 helper), keyed on stable identity (vessel_name + cargo_ref + load_port + laycan_start). `app/matches/page.tsx` / `MatchesClient.tsx`.

## Out of scope (other waves)

- The 5 laycan WRITE sites / seed scripts (regenerate-matches.ts, real-matches.ts) — leave untouched (C5/seed territory; canonical unit = ms means writers are already correct).
- Economics (#782/#783/#784 → C1/C4), gates, seed. Do NOT touch Fit-Breakdown surface or transit math.

## Verify (risk-override — real shapes)

- Laycan: ms value (e.g. 1796... ) → correct Jun 5–Jun 10 (not Jul/Mar garbage); null → graceful; backwards source → handled; created_at freshness/expiry consistent (no stale-vs-fresh flip).
- Floor: a 42% match does NOT appear on the main «Matches» tab.
- Dedup: identical vessel+cargo+port+laycan appears once.
- FULL `npm test` (all ~9051) 0 failures; `npx tsc --noEmit` clean; `git status` clean. Update any source-grep guard that asserts the old laycan/vessel expressions (grep `__tests__/` first — v3.18.0).

Auto-PR to main on QA PASS (full merge+deploy authority granted). Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
