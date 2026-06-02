# adversarial QA Verdict — feat-bunker-oilmonster-blacksea

**Date:** 2026-06-02
**Branch:** feat-bunker-oilmonster-blacksea
**Scope:** OilMonster per-port adapter for Istanbul/Piraeus/Constanta proxy
**Mode:** cold-start adversarial (zero feature-session context)

## Verdict: APPROVE-WITH-FOLLOWUPS

### Summary

The feature is functionally correct for the happy path. All 75 existing tests pass.
23 adversarial tests were written and all confirm the BUG behavior documented below.

### Blocking issues: NONE

No correctness bugs that would cause incorrect data to be surfaced in the UI for the
CURRENT fixture values. The existing tests validate the happy path correctly.

### Required followups (before prod)

**BUG-1 — HIGH: Per-port prices have no range validation**
- Location: `lib/knowledge/bunker/oilmonster-adapter.ts` lines 311-318
- Risk: If the OilMonster per-port page returns a corrupt/maintenance value (e.g., 99999.00
  or 1.00), it will be inserted into the DB without any sanity check. The main table parser
  has identical range guards ([200, 2000]) that the per-port bypass entirely.
- Fix: Replicate the range check from the main table loop before each per-port `upsertBunkerPrice`
- Tests documenting current behavior: `B1` tests in `tests/regression/oilmonster-adversarial.test.ts`

**BUG-2 — MEDIUM: ROCND proxy also bypasses range validation**
- Location: `lib/knowledge/bunker/oilmonster-adapter.ts` lines 329-338
- Risk: If Istanbul returns an extreme value (BUG-1), ROCND = Istanbul + 40 inherits the problem
- Fix: Range check `rocndPrice` before upserting ROCND
- Tests: `B2` tests

### Non-blocking findings

**BUG-3 — MEDIUM: Parser has implicit dependency on `<i>` arrow icon**
- The price regex `/class="scrapitemprice"[\s\S]*?>([\d,]+\.\d{2})<span>\$US\/MT/` requires a
  `>` immediately before the price digits. This `>` comes from the `</i>` closing tag of the
  arrow icon. Without the icon, a newline precedes the price, breaking the regex.
- Current fixtures all have the arrow icon, so this is latent fragility, not a current bug.
- Tests: `B3` tests document the fragile behavior
- Recommendation: Add `\s*` before the price capture group:
  `/class="scrapitemprice"[\s\S]*?>\s*([\d,]+\.\d{2})<span>\$US\/MT/`

**LOW-4: Undocumented 2-decimal-place constraint**
- The regex `[\d,]+\.\d{2}` silently requires exactly 2 decimal places
- Add a code comment noting this expectation

**LOW-5: Misleading test description**
- `__tests__/lib/knowledge/bunker/oilmonster-adapter.test.ts` line 202: test named
  "throws OilMonsterParseError" but asserts `OilMonsterStructureChangedError`
- Fix: rename to "throws OilMonsterStructureChangedError for non-numeric price text"

### Tests written

- `tests/regression/oilmonster-adversarial.test.ts` — 23 tests, all PASS (documenting current behavior)

---

# PREVIOUS VERDICT (matching-gates-engine — 2026-06-02)

**Date:** 2026-06-02  
**Branch:** feat/matching-gates-engine  
**Mode:** adversarial (inline, subagent constraint)

## Verdict: APPROVE

## BUG-1 (FIXED): checkFlagClass empty-string vessel flag (LOW)
- File: lib/sailing/match-filters.ts:checkFlagClass
- Root: normalizeFlag('') = null, but '' != null is true → entered comparison → null !== 'HK' → blocked
- Fix: normalize both sides first, guard on null after normalization
- Test: match-gates-adversarial.test.ts

## Attack surface covered
- Age gate: future-built, age=0, age limit=0
- Dimensions: zero beam, both-fail, exact boundary
- Flag/class: case normalization, empty string bug fixed
- Voyage: uppercase variants, multi-exclusion, non-region strings
- parse-cargo-ai: numeric/boolean/string gear_required, NaN age
- Viewport: undefined ports, conservative on all nulls

## Tests: 73 total, all green
