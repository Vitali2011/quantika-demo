# test-skill Verdict — Layer C (matching-cap)

**Date:** 2026-06-02
**Branch:** feat/matching-cap (commit e460a14e)
**Mode:** adversarial

## Verdict: APPROVE-WITH-FOLLOWUPS

## Findings summary

| Finding | Severity | Blocks? |
|---------|----------|---------|
| GAP-1: limit/offset ignored in topPerCargo path | MEDIUM | No |
| GAP-2: destCrane missing breakbulk amber warning | MEDIUM | No |

## Gate: PASS (no BLOCK-level findings)

- No security bugs (SQL uses parameterized queries only)
- No data loss / corruption
- No breaking API change
- No HIGH introduced by this PR
- 8/8 adversarial regression tests pass
- 1142/1142 existing tests pass (all maintained tests)

## Required follow-ups before board uses topPerCargo

1. **GAP-1 fix:** Add LIMIT/OFFSET support to topPerCargo query path
   ```ts
   // After the topPerCargo WHERE clause, add:
   if (limit !== undefined) { query += ` LIMIT ?`; queryParams.push(limit); }
   ```

2. **GAP-2 fix:** Pass cargoType to destCrane call in runHardFilters
   ```ts
   const destCrane = checkCrane(input.destinationPort ?? null, input.geared, input.cargoType);
   ```

## Attack plan execution status

| Attack | Status |
|--------|--------|
| A1 — LIMIT ignored | Confirmed gap (MEDIUM, not blocking) |
| A2 — destCrane cargoType | Confirmed gap (MEDIUM, not blocking) |
| A3 — warning contract | Verified OK |
| A4 — score_min + topPerCargo | Verified OK |

## OLD VERDICT (matching-gates-engine)

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
