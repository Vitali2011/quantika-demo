# Plan: EUA #739 — regenerate voyage TCE fixtures for VLSFO Cf=3.151

## Context
PR #739 corrects the EU-ETS CO2 factor for VLSFO from 3.114 (which was actually HFO's value) to the authoritative 3.151 (HFO/HSFO stay 3.114). Implemented in `lib/economics/ets.ts` as fuel-aware `cfForFuel`. The lib/economics ets test expectations were already fixed (commit 97294d3a, pushed). BUT the change cascades into voyage TCE: `tests/economics/voyage-calculator.test.ts` and `tests/integration/voyage/tce-api.test.ts` compare computed breakdowns against reference fixtures in `tests/fixtures/voyage-tce/*.json` that were snapshotted with the OLD Cf (3.114) -> 5 tests now fail on the `.toEqual(expected)` deep-equality.

## Failing tests (ground truth from CI run 26762348252)
- `calculateTCE — fixtures matches reference within +-2%` for: berbera-rotterdam, lagos-rotterdam, antwerp-singapore-suez, antwerp-singapore-cape
- `POST /api/voyage/tce returns valid breakdown JSON within SLA`

## Goal
Make the 5 failing voyage tests green by regenerating ONLY the Cf-dependent fields in the affected fixtures, WITHOUT changing the impl and WITHOUT gaming the tests.

## Scope (<=5 files, DATA only)
- `tests/fixtures/voyage-tce/berbera-rotterdam.json`
- `tests/fixtures/voyage-tce/lagos-rotterdam.json`
- `tests/fixtures/voyage-tce/antwerp-singapore-suez.json`
- `tests/fixtures/voyage-tce/antwerp-singapore-cape.json`
- `tests/integration/voyage/tce-api.test.ts` — ONLY if it carries inline expected values affected by Cf (otherwise leave untouched).

## Steps
1. Read `tests/economics/voyage-calculator.test.ts` to learn EXACTLY which fields are compared (toEqual) and how each fixture is loaded; read one fixture file fully.
2. For each failing fixture: identify the Cf-dependent fields (ETS/CO2 EUR+USD amounts, and the totals + daily_tce_usd that derive from them). Recompute them for the NEW VLSFO Cf=3.151. The VLSFO ETS scales by exactly 3.151/3.114 = 1.011882; propagate that delta into total_costs_usd and daily_tce_usd per the calculator's own formula (read the calculator source to get the exact propagation — do NOT guess). Update ONLY the fields the calculator now produces differently; leave all non-Cf fields byte-identical.
3. Run `npx jest tests/economics/voyage-calculator.test.ts tests/integration/voyage/tce-api.test.ts` -> all green.
4. ANTI-GAMING SANITY (mandatory): confirm each fixture's `+-2%` real-world drift assertion still passes after the update (the new daily_tce_usd must stay within 2% of the fixture's reference). If ANY fixture drifts beyond 2%, STOP and report — that means the Cf change is not a pure snapshot shift and needs human review, NOT a blind fixture overwrite.
5. Run full `npm test` -> 0 failures. `npx tsc --noEmit` clean. `npm run lint` -> 0 errors.
6. Commit (clear message) + push to `origin/fix/eua-bunker-ets` (this PR's branch).

## Out-of-scope (orchestrator-set)
- Do NOT modify `lib/economics/ets.ts` or ANY impl — Cf=3.151 is founder-authoritative and already correct.
- Do NOT touch HFO/HSFO fixtures or expectations (HFO Cf stays 3.114).
- Do NOT change the EUA/bunker scrapers added by this PR.
- Do NOT alter the assertion LOGIC of voyage-calculator.test.ts / tce-api.test.ts — only fixture DATA values (unless step 5 inline-expected applies).

## Acceptance
All 5 previously-failing voyage tests pass; full `npm test` green; `+-2%` real-world drift still holds for all 4 fixtures (proves the regen is realistic, not gamed); tsc + lint clean; pushed to the PR branch.
