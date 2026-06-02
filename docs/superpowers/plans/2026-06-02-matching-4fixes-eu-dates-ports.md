# Plan — matching 4-fixes (EU-age cap / open-laycan / port-resolution)

**Branch:** `feat/matching-4fixes-wip` (continue; #1 tabs + #4 cranes already DONE).
**Tier:** L (cross-cutting: parser + normalizer + matcher + port-data; risk-override #5 → mandatory `/test-skill`, TDD on REAL input shapes — not happy-path).
**Founder decision (#4 vague ports):** **Variant A** — resolve vague descriptor → representative basin port + amber "approximate, confirm" note. NOT empty/skip.

## Gate 0 — TRACE map (already done orchestrator-side; embedded so subagent does NOT re-trace blindly)

Target values + their consumers (the sibling-consumers that whack-a-mole rounds keep missing):

- **#3 `parseLaycan`** — 13 consumers: `lib/freshness.ts`, `lib/matching/{session-buckets,persist-session-matches,compute-matches,pair-analyzer}.ts`, `lib/sailing/readiness-gap.ts`, `lib/sample-data/rebase-parsed.ts`, `app/cargo/page.tsx`, `scripts/demo-seed/{analyze,real-matches,regenerate-matches,build}.ts`. Entry = mixed (seed JSON + server runtime). **Real failure data (probe):** 11 cargoes with open-ended laycans (`"7 July 2026 onwards"`, `"From 15 May 2026"`, `"20 May 2026 onward"`, `"2 February 2026 onward"`) → parser ignores "onwards"/"from" → single-day. The "first half of May" case the prior brief named is ALREADY handled — do NOT touch that; the real bug is open-ended.
- **#4 `resolvePort` + `port-master.json`** — resolvePort consumers (7): `lib/port-da/repository.ts`, `lib/sailing/voyage-basin.ts`, `lib/knowledge/distances/lookup.ts`, `lib/economics/{war-risk,voyage-calculator}.ts`, `app/api/voyage/tce/route.ts`, `scripts/knowledge/sources/distances.ts`. port-master importers (12, incl. match-filters/match-scoring/port-distances → distance+draft+crane). Entry = mixed (demo-seed.db match ports + server runtime). **Real failure data (probe):** 35/99 distinct match ports unresolved → **219/347 board-candidate matches (fit≥60) hit `port_not_found` → no P&L** (`app/api/voyage/tce/route.ts:201/208`).
- **#2 EU-discharge cap** — target `regionMatchesPort('europe', destPort)` in `lib/sailing/fit-breakdown.ts:500-510`. ⚠️ **Sibling consumer: `lib/sailing/voyage-restriction.ts:209-210` uses regionMatchesPort for the HARD voyage-exclusion gate.** DO NOT widen `regionMatchesPort` — it would over-block vessels restricted "no european ports". Instead add a SEPARATE detector used only by the cap.

## Out-of-scope (orchestrator-set)

- <orchestrator: do NOT re-parse the corpus (build-sample-data.ts). demo-parsed JSON is good. Only fix matching/parser/port code + port-master data.>
- <orchestrator: do NOT run `real-matches.ts` regen — orchestrator does that locally on the prod-copy DB after merge. Subagent = code + unit tests only.>
- <orchestrator: do NOT touch `regionMatchesPort` behavior or the hard voyage-restriction gate. #2 uses a new isolated detector.>
- <orchestrator: do NOT change matches-repository board query (cap/floor) — only the data that feeds it.>

## Fixes (TDD: write RED test on REAL shape → GREEN impl, per fix)

### Fix #4a — diacritic fold in `resolvePort` (lib/ports/resolve.ts) — cheap systemic win
- Normalize Unicode diacritics before lookup (NFD + strip combining marks) in BOTH the input and the index keys (byName/byAlias) so `"Constanța"→Constanta`, `"Aliağa"→Aliaga`, `"Yarımca"→Yarimca`, `"Giurgiulești"→Giurgiulesti` resolve.
- RED tests (real shapes): `resolvePort("Constanța")` → Constanta; `resolvePort("Aliağa")` → Aliaga.
- **Cross-cutting guard sweep (Rule #23/v3.18.0):** `grep -rl resolvePort __tests__ lib/**/__tests__` → keep `__tests__/ports/resolve.test.ts` green; also war-risk / voyage-calculator / distances tests that resolve ports.

### Fix #4b — add genuinely-missing real ports to `data/ports/port-master.json`
Add proper entries (unlocode, name, country, lat, lon, maxDraftM, hasShoreCranes, berthType, note) — use `scripts/generate-port-master.ts` / `scripts/lib/llm-enrich.ts` pattern OR hand-add with verified coords:
- **Marghera** → add as alias on the existing **Venice** entry (Porto Marghera = industrial port of Venice). (fixes fit-82 Chornomorsk→Marghera)
- **Giurgiulesti** (MD, Danube), **Braila** (RO, Danube), **Vera Cruz/Veracruz** (MX), **Tartus/Tartous** (SY), **Tuapse** (RU), **Abu Qir** (EG), **Adabiya** (EG), **Kavkaz** (RU), **Diliskelesi** (TR), **Yarimca** (TR).
- **Pivdennyi** → add alias to existing **Yuzhny** entry (Pivdennyi = Ukrainian name for Yuzhne/Yuzhny).
- Keep `lib/sailing/__tests__/port-master-json.test.ts` / `port-master-loader.test.ts` / `port-master-wave-a.test.ts` green (schema invariants).

### Fix #4c — vague-descriptor → representative port (Variant A)
- New helper (e.g. `lib/ports/resolve-vague.ts` or fallback inside resolve) `resolveVaguePort(text): {port, approximate:true} | null`:
  1. strip `(unspecified)` / `(port unspecified)` / `(1 port)` / `(ARA range)`; `"X or Y …"` → first token resolves via resolvePort.
  2. country/region keyword → representative port (curated map below). Return `approximate:true`.
  3. genuinely unknown (`"TBS (to be specified)"`, `"Port of Call (unspecified)"`, `"Port of Call, Ukraine (unspecified)"`) → return null → caller shows "port TBC, P&L pending" (graceful, NOT red error).
- Curated representative map (all targets verified to EXIST in port-master):

  | vague descriptor | → representative |
  |---|---|
  | East Coast Greece / Greece (1 port) / Greece (port unspecified) | Thessaloniki / Piraeus |
  | Egypt Mediterranean port (unspecified) | Alexandria |
  | Cyprus (port unspecified) | Limassol |
  | Central Mediterranean port (unspecified) | Augusta |
  | Western Mediterranean (1 port) / 1 safe port Spanish Mediterranean | Barcelona |
  | Eastern Mediterranean (1 port) / Turkish Eastern Mediterranean or Syria… | Iskenderun |
  | East Coast Italy port (unspecified) | Ravenna |
  | 1 safe port Sweden | Gothenburg |
  | United Kingdom (port unspecified) | Liverpool |
  | Turkey (port unspecified) | Istanbul |
  | European Continent (ARA range) | Rotterdam |
  | China (port unspecified) | (out-of-basin → null/graceful) |
  | Puerto Limon or Caldera | Puerto Limon (resolvePort first token) |

- Wire as a FALLBACK in `resolvePortOrPassthrough` (tce/route.ts) and/or the regen port-resolution so P&L computes with the representative port; surface `approximate` so UI shows amber "approximate port — confirm" (mirror the #4 cranes amber pattern in `components/match/MatchWorksheet.tsx`).

### Fix #2 — EU-discharge age cap actually fires (lib/sailing/fit-breakdown.ts)
- New isolated helper `isEuropeanDischarge(port): boolean` = `regionMatchesPort('europe', port)` **OR** country/region substring match on the raw string (Greece, Italy, Romania, Constanta, Bulgaria, Spain, France, Netherlands, Belgium, Germany, Cyprus, Croatia, Slovenia, Portugal, Malta, Turkey-Med, ARA, "European Continent"). Used ONLY in the EU-age cap (line ~504) — replace the bare `regionMatchesPort('europe', …)` call. Do NOT modify regionMatchesPort.
- RED test (real shape): vessel built 1998 (≥25yr vs refYear 2026) + dest `"East Coast Greece port (unspecified)"` → `appliedCap.ceiling===55` and fit≤55. Currently the cap does NOT fire (0 capped) — that is the bug.

### Fix #3 — open-ended laycan → forward window (lib/sailing/date-parsing.ts)
- In `parseLaycan`, BEFORE the single-day fallback (after the existing half-month / month-only blocks), add: match `"<date> onwards|onward|→|from <date>"` / leading `"from <date>"` → parse the single date, return a FORWARD window `{start, end: start + FORWARD_WINDOW_DAYS}`. Use `FORWARD_WINDOW_DAYS = 14` (broker "laycan opens from X" ≈ 2-week loading window; keeps timing-verdict sane, avoids artificial "late").
- RED tests (real shapes from probe): `parseLaycan("7 July 2026 onwards")`, `parseLaycan("From 15 May 2026")`, `parseLaycan("20 May 2026 onward")` → start≠end (a real window), start = the stated date.
- **End-to-end guard (RC: isolated fn ≠ pipeline):** also assert through `rebaseParsedCargoes` → re-`parseLaycan` the re-emitted ISO range stays a range (not collapsed). Keep `lib/sailing/__tests__/date-parsing.test.ts` + `__tests__/sample-data/rebase-parsed.test.ts` + `__tests__/cargo-laycan-render.test.ts` green.

## Acceptance — REAL DATA (orchestrator verifies after merge, NOT unit-green alone)
After `npx tsx scripts/demo-seed/real-matches.ts --db data/demo-seed.db` on the prod-copy DB:
1. **#3:** 0 board matches with single-day laycan among the 11 "onwards/from" cargoes (was 11).
2. **#4:** board matches (fit≥60) with `port_not_found` drop from 219 → ~0 (residual only the genuinely-unknown TBS/Port-of-Call, shown graceful not red).
3. **#2:** ≥1 board match capped at fit≤55 with reason "EU PSC age risk" where vessel ≥25yr + EU discharge (was 0).
4. No column regression (worksheet_json / reason_structured still non-NULL); main-board count stays sane (~28±, not 0, not 600).
5. All swept test guards green + full jest green + `/test-skill` cold QA PASS.

## If you get stuck
Write blocker to `<worktree>/QUESTIONS.md` + state.md, then stop. Do NOT guess representative-port mappings beyond the table; do NOT widen regionMatchesPort; do NOT regen or touch prod.
