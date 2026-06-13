# Attack Plan: feat/wave-d-revive-cleanup

Branch: feat/wave-d-revive-cleanup
HEAD: 7bb062ec
**Generated:** 2026-06-12
**Diff base:** 7499056d..HEAD (8 commits, 87 files)
Stack: TypeScript (Next.js 16 + Jest) — `references/typescript.md` pack loaded.

## Classification

- `lib/parsing/parse-vessel-helpers.ts` (+ lastcargoes-fallback consumer): **parser** → edge/property tests (severity: HIGH)
- `scripts/demo-seed/{backfill-lastcargoes,lastcargoes-patch}.ts`: **data-contract + merger** (no-clobber invariant) → shape-through-consumer + --dry replay on local frozen demo-seed.db (HIGH)
- `app/api/ai/parse-vessel/route.ts` + all parseVesselAIResponse callers: **cross-path-consistency** — emailBody feed landed on 3 of 4 caller paths; `scripts/progonq/run-match.ts:75` stale (HIGH classification, may downgrade by liveness of the path)
- `lib/counterparty.ts::buildVesselPassport` + `components/vessel/VesselPassportPanel.tsx` + `app/vessel/[id]/page.tsx`: **displayed-value-provenance + conditional-ui-liveness + ui-route** → per-field feed verification (principle #8), honest-PSC undefined-vs-0, dead-feed check on sanctions/shadowFleet rows, page-500 edge probes (HIGH)
- `app/reports/roi/page.tsx` + `safeGenerateRoiReport` + dashboard link: **ui-route + api-contract** → session-gate parity, zero-rows honesty, error paths, no-roi-tile guard spirit (MEDIUM)
- DELETION packs (jwc scraper trio, mobile, dashboard cluster, misc): **deletion class** → surviving-reference proof via tsc + targeted jest + seeder smoke + config grep (HIGH if any half-landed)
- `.env.local.example` −4 flags, npm script removal: **env-parity** → zero-reads verified in Phase 1; default-off safety = no behavior change; nothing requires prod env action (MEDIUM→ largely discharged)
- `lib/sailing/match-scoring.ts` CONTAINER line: **validator** → confirm 'CONTAINER' not in CargoType; FCL/LCL behavior unchanged (LOW)
- `components/match/MatchDetailPanel.tsx` deprecated props: **ui-route** → tsc + existing tests (LOW)

## Ordered Attack Sequence

1. **HIGH — A (parser/merger)**: lastCargoes fallback semantics — LLM-wins; `{value:null}`, `[]`, `''` unwrap-vs-fallback ordering; no corruption of existing values; fallback regex garbage tolerance; existing parse-vessel fixtures unchanged (run existing suite). Patch transform: no-clobber, idempotency, `''`-valued field edge, cargo rows untouched, root-shape preservation.
2. **HIGH — B (data-contract)**: local frozen `data/demo-seed.db` (read OK): census of `parsed_results.result_json` ROOT shapes (array / bare object / `{items:[...]}` wrapper?); run backfill DRY against the local db; verify numbers, idempotency claim, shape-through-consumer (re-read patched JSON through the app's own result_json reader — find that reader first).
3. **HIGH — C (provenance/liveness)**: buildVesselPassport per-field feed (flag/MoU, class/IACS, P&I/IG, age incl. built floor + future-built, psc undefined-vs-0 incl. `hasInspectionData` per-imo semantics + `getDetentionCount` since-param check); panel binding assertions (RTL); dead rows sanctions/shadowFleet (producers grep); page-500 probes (imo shapes, refYear edge).
4. **HIGH — D (deletion sweep + builds)**: `tsc --noEmit`; targeted jest batteries across 4 test-dir conventions; `npx tsx scripts/knowledge-jwc-yaml-seed.ts --dry-run`; rag-visual T02 untouched (verified Phase 1, re-assert); jest/playwright config references to deleted dirs; package.json scripts; `splitBunkerSavings` producer history (pre-existing vs introduced dead consumer).
5. **MEDIUM — E (roi page)**: folded into C/D agents — session gate parity (pattern equality with /dashboard), `getRoiSummary` error paths unreachable with constants, zero-rows body honesty, no-roi-tile guard letter+spirit, `getDb` vs `getDatabase` naming drift.

## Project Rules Applied

- `.claude/rules/retriever.md` → diff does NOT touch retriever*/pipeline; allowlists still contain jwc (KEEP per rescope). Attack item: assert allowlist content + rule text still mutually accurate (verify-only, agent D).
- `.claude/rules/ai-provider.md` → intersects nothing (1-line arg pass in parse-vessel route; no LLM-call changes).
- `.claude/rules/admin-api.md` → intersects nothing (no /api/admin routes; /reports/roi is a page; middleware untouched — confirm middleware does not need bypass for /reports/roi: it's a session-gated page like /dashboard, not token-auth).

## Skipped (why)

- `docs/superpowers/plans/2026-06-12-wave-d-revive-and-cleanup.md` — docs.
- Deleted test files themselves — sanctioned §1.
- `.env.local.example` further attack — zero code reads proven in Phase 1; removal of example-only lines is a no-op; no new env reads in diff.

## Coverage Notes

- No auth/sanitizer/migration/concurrency signals in this diff (no new endpoints with write semantics; /reports/roi is read-only server page).
- Full `npm test` forbidden (project convention) — baseline = targeted suites per the 4 test-dir conventions.
- Browser E2E skipped: no dev server build from HEAD required for the above classes (component-level RTL + server-page logic attacks suffice; freshness rule makes an ad-hoc browser run a phantom-risk, not a value-add).
