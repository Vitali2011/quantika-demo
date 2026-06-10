# Plan: full LIST↔DETAIL TCE parity (real market inputs)

**Goal:** make the match LIST `tce_usd_per_day` EXACTLY equal the match DETAIL "Daily TCE" across all demo matches, using REAL market inputs.

**Acceptance test (definition of done):**

- `SESSIONS_DB_PATH=data/demo-seed.db DEMO_MODE=true KNOWLEDGE_LAYER_DISTANCES_ENABLED=false npx tsx scripts/diag/tce-list-vs-detail-audit.ts` → 0 matches diverging >0.5%; "not measurable on both sides" count drops ~76.
- `npx tsc --noEmit` clean.
- `npx jest __tests__/economics/list-detail-tce-parity.test.ts` green (no expectation edits — RC1).

## Background — two live engines diverge on inputs

- LIST: app/matches/page.tsx:51-54 → persistSessionMatches (persist-session-matches.ts:38-39) → computeStoredMatchEconomics({cargo,vessel,db}) → buildMatchEconomics → buildCanonicalTceInputs → calculateTCE. **Renders a live recompute, NOT the frozen `tce_usd_per_day` column.**
- DETAIL: EconomicsTab.voyageInputData (~282-348) → POST /api/voyage/tce (route.ts) → calculateTCE.
- Duration + freight already agree (PR #862). DA already agrees. Four divergences remain.

## Cause #1 — BUNKER (78.9% of gap, all 239 matches) — align LIST → live DB price

LIST uses hardcoded `DEFAULT_BUNKER_USD_PER_MT=600` (tce-calculator.ts:30) only because persistSessionMatches passes no price. DETAIL resolves `getLatestBunkerPrice(db,'NLRTM','VLSFO')` ≈ 791. Decision: real market price both sides.

- `lib/matching/persist-session-matches.ts:38-39`: resolve `getLatestBunkerPrice(db,'NLRTM','VLSFO')` ONCE before the loop, pass `bunkerPriceUsdPerMt` into `computeStoredMatchEconomics`. (helper already accepts it: stored-match-economics.ts:40,64,142.)
- `lib/matching/compute-matches.ts:77`: same one-line pass (mirror).
- pair-analyzer.ts (forwards param) + regenerate-matches.ts (already live) — NO change.
- Mirror caveat: DETAIL's bunker port is nominally per-match (recommendation effect EconomicsTab.tsx:160-162). Audit replica hardcodes NLRTM/VLSFO → matches the fix. True per-route bunker parity = out-of-scope follow-up.

## Cause #2 — CANAL SUEZ (15%, ~35 matches) — align DETAIL → LIST (Suez is real)

LIST auto-derives Suez+Bosporus (tce-calculator.ts:329-346). DETAIL only adds Bosporus (route.ts:237-241).

- `lib/matching/tce-calculator.ts`: export the private Suez helpers (mirror the existing Bosporus exports at ~259-260): `routeTransitsSuez`, `quoteSuezSafe`. **Verify the exact private names before exporting.**
- `app/api/voyage/tce/route.ts:237-241`: inside the EXISTING guard (`typeof data.canalUsd !== 'number' && !data.route.viaSuez && !data.route.viaCanal`), add laden Suez: `if (routeTransitsSuez(originResolved.portName, destinationResolved.portName)) canalUsd += quoteSuezSafe(data.vessel.dwt, true);`. Add the two names to the existing tce-calculator import.
- Blast radius: change strictly inside the existing guard → callers sending explicit canalUsd/viaSuez/viaCanal untouched (no double-charge). RouteCompareModal uses a different route. Ballast-leg Suez NOT added to detail (no open-position input there).

## Cause #3 — ETS / EU detection (6%, 36 matches) — align LIST → DETAIL (DETAIL correct)

Both call `isEuCountry(resolvePort().country)`, but LIST's `deriveEtsCoverage` uses `resolvePort` only (null on vague broker ports), while DETAIL uses `resolvePortOrPassthrough` → `resolveVaguePort`. #314 Spanish-Med→Sweden is genuinely intra-EU → ETS applies → DETAIL correct.

- `lib/matching/tce-calculator.ts` `deriveEtsCoverage` (~264-270): make vague-aware — `resolvePort(x) ?? resolveVaguePort(x)` for both load/disch. `import { resolveVaguePort } from '@/lib/ports/resolve-vague';`
- Blast radius: only turns previously-null (→non-EU) ports into resolved basin ports → can only ADD correct ETS, never remove. Route ETS logic untouched.

## Cause #4 — PORT RESOLVER (~76 "not measurable") — make resolvePort accept real ports

DETAIL `resolvePort` rejects "Giurgiuleshti" (DB `h`-spelling) that LIST `getPortDistance` accepts via alias. Giurgiulesti is a real Moldovan port (port-master.json MDGIU, MD).

- `data/ports/port-master.json` MDGIU entry: add `"Giurgiuleshti"` to `aliases`.
- DB scan (read-only, before editing): `SELECT DISTINCT load_port, discharge_port FROM matches`; for each non-vague string where getPortDistance resolves but resolvePort+resolveVaguePort both null → add targeted alias. Do NOT broaden resolvePort fuzzy logic.

## Sequencing

All four are independent files/paths. Order: #1 bunker → #2 Suez + #3 ETS (both touch tce-calculator.ts) → #4 port alias. Re-run audit after each.

## Tests (RC1: do NOT edit expectations to match impl)

- `__tests__/economics/list-detail-tce-parity.test.ts` — independent oracle; expect GREEN, no edits.
- route tests / tce-backward-compat / tce-ets-autoderive — guarded changes; expect green. If a no-canalUsd Suez-transiting route test asserts a specific TCE, that encoded old-buggy behavior → expectation legitimately changes (justify).
- EconomicsTab / ets kernel tests — unaffected.
