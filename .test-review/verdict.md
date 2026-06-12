VERDICT: APPROVE-WITH-FOLLOWUPS
Branch: feat/wave-a-phantom-features
HEAD: 534e72a5

# Test Review Verdict: wave A — phantom features + matches column sorting

**Date:** 2026-06-12
**Reviewer:** test-skill (cold-start, no feature-session context)
**Diff reviewed:** 40966379..534e72a5 (12 commits, 68 files, +2369/-2810)

## Summary

- Tests added: 48 (1 seeded-random property, 9 bit-identity matrix cases ×2 flag states, 13 RTL/behavioral, other contract/adversarial) in 4 suites under `tests/regression/wave-a-*`
- Bugs found: 5 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 3 LOW, 1 test-bug)
- Pre-existing bugs noted: 2 (+2 cosmetic doc crumbs) — do not block
- Attack plan: 10/10 items executed; baseline 158 suites / 1355 tests green on HEAD; `tsc --noEmit` clean

## Findings

### CRITICAL (blocks merge)

- (none)

### HIGH (blocks merge if new)

- (none) — the three cross-cutting classes specifically came back clean:
  - displayed-value-provenance: FuelEU tile/waterfall bind `breakdown.fueleu_usd` exactly; total binds `total_costs_usd` (computed upstream, no UI re-add); legacy persisted breakdowns w/o the key render safely.
  - conditional-ui-liveness: FuelEU feed LIVE (EconomicsTab sends `includeEuETS: true` → route sets originEu/destEu → flag branch); charterer penalty feed LIVE (analyzePairs → fit_breakdown.chartererPenalty → UtilisationChartererDisclosure "−4" line); honest-PSC neutral verified at engine level, checked-clean "0 detentions" preserved.
  - cross-path-consistency: single production call site for detentionCount/chartererTier (pair-analyzer); all board paths (compute-matches, ai/match route, regenerate-matches) go through analyzePairs; regenerate-matches' wholesale item cast carries backfilled chartererName. Sibling seed-tools divergence is pre-existing and REDUCED by this PR (see Pre-existing).
  - sanctioned §3 bit-identity: verified against the literal main@40966379 computeTce over a 9-case matrix — flag off ⇒ numerically identical, only new keys added.

### MEDIUM (follow-up OK)

- **FINDING-001: seed-charterers crashes on same-name/different-id pre-existing row; --dry-run can't predict it; no transaction → partial apply on failure**
  - File: `scripts/demo-seed/seed-charterers.ts` (+ `upsertCharterer` ON CONFLICT(id) vs name UNIQUE in migration 026)
  - Repro: `tests/regression/wave-a-psc-charterer-crosspath.test.ts`
  - Fix hint: transaction around DELETE+upserts; pre-delete/upsert by normalized name; make --dry-run open the DB and print the real would-change diff.
  - Why not HIGH: loud crash, no silent corruption; recoverable by rerun; touches only the prod-apply step (T7), not the merged runtime.

### LOW / Test-bugs

- **FINDING-002**: latent crash — `computeTce` throws on unknown `fuelType` when FUELEU_ENABLED + EU leg (`fueleu.ts` throw). No producer sets fuelType today (always 'vlsfo'). Fix hint: validate/fallback or try/catch like the ECA block.
- **FINDING-003**: resolver tie on normalized-duplicate names → alphabetically-first (binary collation) wins; letter case decides tier. Spec silent; shipped fixture has no collisions (test pins that).
- **FINDING-004**: non-Latin chartererName → silent neutral; live-LLM long forms ("Huaya Maritime") won't match seeded "Huaya". Corpus-consistent today (backfill shares the regex; 1/1 binding matches). Follow-up: alias/prefix matching.
- **FINDING-005** (test-bug, mine): `-0` vs `0` Object.is in my antisymmetry assertion — comparator returning `-0` is fine for Array.sort; test fixed, noted for the false-positive trail.

## Pre-existing Issues (informational, not gate-relevant)

- `scripts/demo-seed/patch-fit.ts` / `real-matches.ts` compute fitBreakdown without detentionCount/chartererTier — pre-existing (on main the divergence existed for EVERY vessel; this PR narrows it to data-having vessels). Running patch-fit after the seeds would strip vetting/charterer deltas — align or retire before next use.
- `applicable.fueleu` gates on USD>0 while `applicable.ets` uses calculator-applicability — cosmetic inconsistency.
- Stale doc crumbs: demo-scenario 13 narrative cites deleted check-deadlines.ts; MatchesClient.tsx:131 comment cites SubsCountdown.

## Coverage Gaps (what we couldn't test)

- Live LLM extraction of charterer_name (dev LLM down 2026-06-11) — schema/normalizer contract verified, prompt effectiveness not.
- No browser E2E against a built app (jsdom only) — post-deploy smoke should click sort headers and open an EU-voyage detail.
- localeCompare collation environment-dependence — cosmetic.
- Concurrency / auth / migration classes: no signals in this diff, not deployed.

## Deploy Gate (NOT covered by this review — verify before declaring "prod works")

This review covered the pre-merge DIFF only. The wave's value is mostly DATA+ENV — nothing below happens by merging:

- [ ] **Env on prod** (`/root/quantika-demo` .env.local): `FUELEU_ENABLED=true` is a SERVER runtime flag — `systemctl restart quantika-demo` re-reads it, no rebuild needed for the cost line. `NEXT_PUBLIC_FUELEU_ENABLED` has ZERO code readers (doc-only). `NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=true` IS bake-time → requires rebuild-deploy to affect /charterers pages. NOTE: the scoring path is NOT flag-gated — charterer penalties go live from DATA alone after regen, regardless of flags.
- [ ] **Seeds on prod db** `/root/quantika-demo/data/demo-seed.db` (требует формулы «разрешаю запись на outreach-vps»):
  - `seed-charterers --db <prod-path>`: FIRST run `SELECT id,name FROM charterers` — a same-name row under another id will CRASH the seeder mid-apply (FINDING-001).
  - `seed-psc-history`: targets `SESSIONS_DB_PATH` (defaults to `data/sessions.db` relative to cwd!) — export it explicitly to the demo-seed path or rows land in the wrong DB silently.
  - `backfill-charterer --db <prod-path> --dry` → expect ~1 row ("huaya") → `--apply`.
- [ ] **Regen** `regenerate-matches --dry` → числа фаундеру → apply. Required to surface: charterer −4, honest PSC neutral, FuelEU in stored TCE. Sequencing: flip FUELEU_ENABLED and regen in the same window — freight-edit PATCHes in between produce mixed-state board TCE (edited rows include FuelEU, others don't).
- [ ] **Post-apply counts**: charterers=3, psc_detention_history=16, parsed_results with chartererName=1 (local working copy is the reference shape).
- [ ] **Post-deploy smoke** (qa-walker): /matches header click ×2 (order flips, ↓/↑ indicator, footer "ranked by …"); EU-voyage match detail → FuelEU tile + waterfall line; vessel WITHOUT psc rows → vetting neutral, no "0 detentions"; vessel 9166510 → detentions visible; Huaya match → "Charterer tier penalty −4"; bundle-grep `th-sort-dwt`, `fueleu_usd`.
- [ ] Fresh build from the merged commit via deploy.yml (staged build + atomic swap, #940) — NEXT_PUBLIC flags bake at build.

## Verdict

⚠️ **APPROVE-WITH-FOLLOWUPS** — see MEDIUM finding above (seed-charterers transaction + name-aware upsert + real dry-run); merge is allowed. Follow-up candidates beyond the gate: FINDING-002 fuelType fallback, FINDING-004 alias matching, patch-fit/real-matches alignment, stale doc crumbs.

---

## Controller addendum (post-verdict, 2026-06-12)

Followups consumed on branch before merge:
- F-001 (MEDIUM) — seed-charterers: transactional DELETE+INSERT, same-name/different-id rows ADOPTED in place (id preserved, rating aligned), --dry-run now opens the DB read-only and reports clashes. QA pin flipped to adopt semantics (wave-a-psc-charterer-crosspath.test.ts).
- F-002 (LOW) — compute-tce: unknown fuelType falls back to vlsfo instead of throwing. QA pin flipped (wave-a-fueleu-economics.test.ts).
- F-003/F-004 (LOW) — accepted as documented behavior (fixture collision-free, corpus-consistent binding); pinned by QA tests, revisit if live-LLM corpus diverges.

**Verdict effective: APPROVE (followups consumed).**
