# Discovery: feat/wave-c-engine-logic

Branch: feat/wave-c-engine-logic
HEAD: 13029428
Base: main e9070fe2
Date: 2026-06-12 (cold-start adversarial review, test-skill v0.4.2)

## Scope (16 commits, 38 files, +1647/−114)

Wave C of the 2026-06-12 logic audit. Plan: `docs/superpowers/plans/2026-06-12-wave-c-engine-logic.md`.
8 sanctioned spec changes (C.1–C.8) — founder-approved; verified implemented, not re-reported as bugs:

| Item | Change | Files |
|------|--------|-------|
| C.1 | Bosporus charged on ANY Black Sea exit (was med↔blacksea only) | `lib/matching/tce-calculator.ts:200-213` |
| C.2 | `/api/voyage/tce` rejects durationDays ≤ 0 (was 200 with $0) | `app/api/voyage/tce/route.ts:86` |
| C.3 | IMSBC Group A hard-blocks on liquefaction-restricted vessels + dual-hazard Group B concentrates | `lib/sailing/imsbc-check.ts:272-360`, `match-filters.ts` (comment) |
| C.4 | Hold-cleanliness incompatible → matchLevel 'weak' → review bucket | `lib/matching/hold-cleanliness.ts:31-33` |
| C.5 | One match per ITEM pair: migration 051 + repository + persist + regen + dashboard + UI keys | `lib/migrations/051-*`, `matches-repository.ts`, `persist-session-matches.ts`, `regenerate-matches.ts`, `app/dashboard/page.tsx`, `app/matches/MatchesClient.tsx` |
| C.6 | 90–100k DWT fallback → panamax (was capesize) | `lib/sailing/readiness-gap.ts:88-99` |
| C.7 | Back half of laycan window → 'tight' (was 'ideal') + distinct explanation copy | `lib/sailing/readiness-gap.ts:117-137,162-169` |
| C.8 | Negative freight clamp; Suez war-risk out of totalUsd; NT_DWT_RATIO 0.65 canonical; economics 0.1-rounding | `compute-tce.ts:136-138`, `canals/suez.ts:96-99`, `canals/types.ts`, `constants.ts:121-125`, `fit-breakdown.ts:518`, both API routes |

## Verified wiring (read from code, not the plan)

- `applyHoldCleanliness` has exactly ONE caller: `pair-analyzer.ts:771` — after level
  assignment (:751), before sort/partition (:775+). Partition `matchLevel==='weak'` →
  `lowConfidenceMatches` (pair-analyzer:798-800). Dashboard filters `good|possible`
  (`app/dashboard/page.tsx:74`) → demoted pairs leave priority cards. ✓
- `routeTransitsBosporus` exported; consumed by buildMatchEconomics (laden+ballast) AND
  `app/api/voyage/tce/route.ts:263,277` (laden+ballast) — one change covers both paths. ✓
- `classifyVesselByDwt` consumers: fit-breakdown (:221 class-fit, :658 ballast radius, :700),
  match-scoring:259, readiness-gap:211 (bunker defaults), laden-draft:44.
  `breakevenTceByDwt` is pure-DWT thresholds (no class mapping) — no 90–100k hole there. ✓
- EconomicsTab is the only client POSTing `/api/voyage/tce`; durationDays =
  ballastDays + ladenDays + 2 (`canonical-tce-inputs.ts:50`) ≥ 2 when `ready` → C.2's 400
  unreachable from the UI. ✓
- Migration 034 index name `idx_matches_unique_cargo_vessel_user` matches 051's DROP exactly;
  no other code creates either index. `runMigrations(db, migrations)` signature confirmed. ✓
- `createMatch` writers: persist-session-matches:165 (item-aware ✓), compute-matches:128
  (passes item indices ✓), `app/api/matches/route.ts:169` (does NOT pass item indices → defaults 0,
  pre-existing manual-create path), regen:697 (explicit item columns ✓).
  Seed-builder writers NOT in plan scope: `scripts/demo-seed/build.ts:655,752` (keeps
  one-per-email-pair dedup), `patch-fit.ts:357`, `real-matches.ts:91` — local-only seed tools.
- Slug (`toMatchSlug(cargoId, vesselId)`) carries NO item index. Producers:
  app/cargo/[id]:341, app/vessel/[id]:213, ActionPanel:65. `getMatchBySlug` now ORDER BY
  fit DESC, score DESC, id ASC — deterministic best-item resolution.
- `toBucketRows` (`lib/matching/session-buckets.ts:92-117`) builds StoredMatch rows WITHOUT
  `cargo_item_index`/`vessel_item_index` → MatchesClient bucket key `?? 0` degrades —
  see attack plan A6.

## .claude/rules overlap

None. Diff does not touch `lib/ai-provider.ts`, `lib/knowledge/embeddings/*`,
`app/api/admin/**`, or `middleware.ts`. The two touched API routes (/api/voyage/tce,
/api/canal/*) pre-exist and have no admin/bypass interaction.

## Existing test coverage added by the branch

- New: tce-calculator-bosporus (5), voyage-tce-duration (3), matches-item-uniqueness (4),
  persist-session-matches-multi-item (1), match-slug item-resolution (1), readiness C.6/C.7
  blocks, imsbc-check +4 describes (~20 cases incl. acceptance-phrasing guards), canal NT
  parity (1), compute-tce clamp (1), suez war-risk exclusion (2), fit-breakdown 0.1-rounding (1),
  hold-cleanliness demotion (3), match-filters hard-gate (1).
- Rewritten under sanction: matches-repository-refresh (B.6 dedup → item-aware),
  persist-dedup-tie-semantics (banner comment present ✓), ballast-size-cap 95k case,
  match-realism-buckets fixture re-routed strait-free (Constanta), match-worksheet-migration
  (50→51 — NOTE: asserts `last.name === 'matches-item-unique'` while the 050 assert used the
  file-prefixed `'050-matches-breakeven'`; checked 051 source: `name: 'matches-item-unique'` — consistent).

## Known pre-existing failures (stated by caller, to verify on base)

8 suites / 16 tests on base main. Blast-radius carve-in candidates (touch values this branch
changes): `ballast-size-cap-adversarial:273` (#846 — file modified by branch),
`test_imsbc_section_size_cap` (IMSBC verdicts changed), `test_economics_confidence_adv` +
`test_economics_edge_cases` (computeTce changed). Must diff base-vs-branch failure signatures.
