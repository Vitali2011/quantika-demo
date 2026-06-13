# Findings: feat/wave-d-revive-cleanup

Branch: feat/wave-d-revive-cleanup
HEAD: 7bb062ec
**Phase 3 completed:** 2026-06-12
**Attack plan executed:** 5 tracks (4 HIGH, 1 MEDIUM) — all executed
**Sub-agents dispatched:** 0 (no Task tool in this session; tracks executed sequentially with parallel background Bash — within the ≤4 cap)

## Tests Added (tests/regression/, run with --testPathIgnorePatterns "/node_modules/")

- tests/regression/wave-d-lastcargoes-fallback.test.ts — 12 tests (parser: LLM-wins ordering, wrapper edges, garbage tolerance, extractor invariants)
- tests/regression/wave-d-lastcargoes-patch.test.ts — 8 tests (data-contract/merger: no-clobber, idempotency, shape preservation, loud failure on malformed JSON)
- tests/regression/wave-d-passport-provenance.test.tsx — 13 tests (provenance/liveness: builder feed edges, exact panel bindings, honest-PSC, dead-feed honesty)

All 33 PASS on HEAD 7bb062ec.

## Baseline & smokes (raw facts)

- Targeted baseline: 95 suites / 1582 tests PASS (parse-vessel, counterparty-passport, components/vessel, components/match, components/dashboard, roi suites incl. no-roi-tile guard, market-snapshot-label, backfill test, lib/sailing).
- tsc --noEmit (8GB): clean exit 0 — zero surviving type-level references to any deleted module.
- backfill-lastcargoes DRY on local frozen demo-seed.db (2026-05-10): 50 vessel rows → rows-patched=0, already-set=1, no-lc-in-body=49, missing-email=0. Non-destructive; readonly db handle in dry mode.
- knowledge-jwc-yaml-seed --dry-run: works — "7 zones → 7 chunks (not stored)". Canonical seeder unaffected by scraper deletion.
- demo-seed.db census: all 50 vessel result_json roots are ARRAYS of camelCase parsed items; all already contain a lastCargoes key. The {items:[...]} wrapper-root risk does NOT materialize; patch convention (array | bare object) matches reality.
- jwc RAG layer intact on HEAD: jwc_vec/jwc_fts in all ALLOWED lists (pipeline.ts:80-81, retriever-sqlite.ts:25-26, retriever-vertex.ts:20+31), bootstrap entry kept, regenerate-matches RAG-copy lists (:127-128), compare-routes untouched, __tests__/e2e/rag-visual-verification.spec.ts T02 untouched and inside playwright testDir.
- Dead env flags: zero process.env reads anywhere; removal is example-file-only. NO new env reads introduced.
- ROI page session gate byte-pattern-identical to /dashboard. Migrations 028+030 in allMigrations (boot) — tables guaranteed. getDb()/getDatabase() same handle.
- CargoType has no 'CONTAINER' member (lib/types.ts:159) — deleted case unreachable; FCL/LCL preserved (green baseline).

## Failures Found

### FINDING-001 [LOW]
**Title**: jest.config.mjs keeps an ignore pattern for a file this PR deletes
**File**: jest.config.mjs:15 — '/tests/e2e/mobile\.spec\.ts$'
**Failure**: tests/e2e/mobile.spec.ts deleted in this PR; ignore line now dead config.
**Severity**: LOW — cosmetic; pattern never matches.
**Pre-existing on main**: No — residue introduced by the deletion.
**Fix hint**: drop the line in a follow-up.

### FINDING-002 [LOW]
**Title**: progonq eval harness parses vessels without email body — fallback never exercised in evals
**File**: scripts/progonq/run-match.ts:75 — parseVesselAIResponse(raw, sc.id, subject) (4th arg absent)
**Failure**: 3 of 4 callers pass email.body (live route, build-sample-data, parse-llm-direct); the golden-set eval harness does not → eval parse behavior diverges from prod for lastCargoes (and pre-existing built) fallback.
**Severity**: LOW — eval-only script, no prod data path; corpus feeds reference_output (already-parsed), fallback relevance marginal. Eval-fidelity gap, NOT a half-landed write path (all write paths — live parse + backfill — covered).
**Pre-existing on main**: Partially (built-fallback had the same gap); lastcargoes widens it.
**Fix hint**: pass sc.input?.body ?? null as 4th arg if corpus carries bodies.

### FINDING-003 [LOW / test-bug trail]
**Title**: reviewer's initial pin of {value: null} wrapper was wrong — actual behavior is BETTER
**File**: tests/regression/wave-d-lastcargoes-fallback.test.ts
**Failure**: first version expected String(null) → "null" (skip-fallback); HEAD routes the emptied wrapper to the fallback. Test-bug, not a PR bug; corrected test pins the good behavior.

## Items That Passed (attack succeeded, no bug found)

- LLM-wins ordering: string / confidence-wrapped / array values win over body regex; fallback can never overwrite. 6/6.
- Patch no-clobber + idempotency: non-null never overwritten; second run 0 + byte-stable; siblings byte-identical; root shape preserved; malformed JSON throws loudly. 8/8.
- Passport provenance: empty-string imo safe; built floor 1899/1900 exact; future-built omitted; built=refYear → age 0 rendered; NaN safe; per-imo PSC feed; honest 0 with in-data/out-of-window detentions; psc undefined when no rows; sanctions/shadowFleet never fabricated. Panel binds exact fields; empty/imo-only passport renders nothing; Paris MoU badge literal. 13/13.
- Existing parse-vessel fixture expectations unchanged (calls without body identical).
- Deletion sweep: zero surviving references (imports, barrels, dynamic-import strings, package.json scripts, jest/playwright configs except FINDING-001) for ALL deleted files; tsc clean.
- env-parity discharged; no prod env action required.
- .claude/rules/retriever.md vs HEAD allowlists mutually accurate (jwc kept per RESCOPE); retriever*/pipeline NOT touched — confirmed.
- no-roi-tile guard passes literally (green baseline). Spirit: removed tile auto-rendered numbers + ROI_GUARANTEE flag; new element is a navigation link to an honest session-gated preview page — explicitly sanctioned by the plan («достаточно ссылки с дашборда», founder decision). No conflict.
- ROI zero-rows honesty: empty roi_metrics → "No voyages recorded"; RangeError unreachable with constants (99, 90); any compute/db throw → readable "ROI report unavailable", not a 500.

## Pre-existing Issues (informational, do not gate)

- lib/explain-deal-validator.ts:123 + lib/types.ts:66 — splitBunkerSavings consumer/type with NO producer; identical on base 7499056d (split-bunker.ts was not wired even on main). Dead residue, backlog.
- scripts/knowledge/refresh.ts:27 slug 'jwc' (+ bootstrap.ts:53 refresh_command) → ./sources/jwc never existed under scripts/knowledge/sources/ (git history empty) — pre-existing stub, documented in RESCOPE.
- lastCargoes [] empty-array wrapper yields '' and skips body fallback (truthy gate) — pre-existing output shape; pinned in regression tests.

## Coverage Gaps

- No browser E2E: no built-from-HEAD server; ad-hoc stale-build run risks phantoms (Step 1.5). Post-deploy smoke delegated to Deploy Gate / qa-walker.
- Full npm test not run — forbidden by convention; baseline = targeted 95-suite battery.
- Multi-vessel emails: one body-wide L/C applied to every item lacking last_cargoes (live + backfill consistent) — possible cross-vessel mis-attribution; semantics spec-sanctioned (plan T4 Step 2), not filed.
- Prod backfill impact unknown from here (local snapshot says ~0; prod differs) — Deploy Gate item per plan T7 formula.

## Blocked Items

- (none)
