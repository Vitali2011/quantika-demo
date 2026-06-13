VERDICT: APPROVE
Branch: feat/wave-d-revive-cleanup
HEAD: 7bb062ec

# Test Review Verdict: wave D — revive (vessel passport / lastcargoes / ROI) + dead-code cleanup

**Date:** 2026-06-12
**Reviewer:** test-skill v0.4.2 (cold-start, no feature-session context)
**Diff:** 7499056d..7bb062ec (8 commits, 87 files, +904/−6633)

## Summary

- Tests added: 33 (3 suites under tests/regression/: parser 12, data-contract/merger 8, provenance/liveness 13) — all pass on HEAD
- Bugs found: 2 LOW (+1 test-bug trail). 0 CRITICAL, 0 HIGH, 0 MEDIUM
- Pre-existing bugs noted: 3 (do not block)
- Baseline: 95 targeted suites / 1582 tests green; tsc --noEmit clean

## Findings

### CRITICAL — none
### HIGH — none
### MEDIUM — none

### LOW / Test-bugs

- **FINDING-001**: jest.config.mjs:15 retains the ignore pattern for the deleted tests/e2e/mobile.spec.ts — dead config line, drop in a follow-up.
- **FINDING-002**: scripts/progonq/run-match.ts:75 — eval harness is the only parseVesselAIResponse caller not passing email body; eval-fidelity gap for the new lastcargoes (and pre-existing built) fallback. Eval-only, not a prod write path.
- **FINDING-003**: test-bug trail — reviewer's initial pin of the {value:null} wrapper was wrong; HEAD routes it to the fallback (good behavior, now pinned).

## Pre-existing Issues (informational)

- splitBunkerSavings dead consumer/type (explain-deal-validator.ts:123, types.ts:66) — no producer even on base; backlog cleanup.
- refresh.ts slug 'jwc' / bootstrap refresh_command point at a never-existing module — pre-existing stub, documented in the Task 3 RESCOPE.
- lastCargoes [] wrapper yields '' and skips fallback — pre-existing shape, pinned.

## Spot checks demanded by the controller (all verified)

- retriever files NOT touched; .claude/rules/retriever.md still accurate (jwc kept per RESCOPE). ✓
- jwc surgical cut: allowed-lists/bootstrap/regen-copy/compare-routes/T02 intact; jwc-yaml seeder dry-run works (7 zones → 7 chunks). ✓
- Passport provenance: per-field feeds verified, no fake defaults, honest PSC undefined-vs-0, page-500 edges covered (migrations 028/030 boot-applied, builder throws on no edge tested). ✓
- Lastcargoes: LLM-wins, no corruption possible, backfill idempotent + shape-preserving, existing fixtures unchanged. ✓
- ROI: session gate parity with /dashboard, honest zero body, no-roi-tile guard passes in letter and spirit (dashboard LINK sanctioned by founder-decided plan; not a tile with numbers). ✓
- env-parity: no new flag reads, removed flags had zero reads — nothing needs prod env changes. ✓

## Coverage Gaps

- No browser E2E (no built-from-HEAD server; delegated to Deploy Gate / qa-walker per Step 1.5 freshness rule).
- Full npm test not run (project convention; targeted 95-suite battery instead).
- Multi-vessel body-wide L/C attribution — spec-sanctioned semantics, not attacked further.

## Deploy Gate (NOT covered by this review — verify before declaring "prod works")

- [ ] Fresh full build on prod from the merged commit (new pages /reports/roi + passport panel need npm run build; "client reference manifest" errors otherwise)
- [ ] systemctl restart quantika-demo after deploy (env re-read; no env CHANGES required by this wave)
- [ ] Prod data: backfill-lastcargoes --dry on PROD db first → report numbers → founder formula before --apply (local frozen snapshot showed ~0 to patch; prod will differ)
- [ ] Regen after backfill --dry first (hold-cleanliness input expands → board may shift) → numbers → formula
- [ ] Post-deploy smoke: / , /vessel/<id> (passport panel renders, no 500), /reports/roi (gate + honest body), /dashboard (ROI link), compare-routes jwcCitations (T02 expectation) — qa-walker γ-smoke per plan T7
- [ ] Bundle grep per plan: VesselPassportPanel present, jwc_vec still in regen RAG-copy log

## Verdict

✅ **APPROVE** — no blockers found, attack plan fully executed
