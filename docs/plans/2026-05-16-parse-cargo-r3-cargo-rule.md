# Parse-Cargo R3: Cargo Description Rule Fix

**Date:** 2026-05-16
**Branch:** feat/parse-cargo-r3-cargo-rule
**File:** lib/prompts/parse-cargo.ts (CARGO DESCRIPTION RULES section only)

## Context

Phase 3b shipped R1 (laycan literal-only, +4pp 82.4->86.4). R2 (canonical form, exclude stowage/dims) reverted at -0.1pp. This is R3.

**Baseline:** R22-A median = 84.4% cargo_description match (373/442 item_matches passing)

## Failure Analysis (Opus cluster from R22-A-1/2/3)

**Total:** 69 fails / 442 assessments across 285 scenarios (3 runs x 95 scenarios)

### Cluster A -- Stowage/dims omitted (approx 39 fails, ~13 unique items x 3 runs)

Model outputs base commodity+form but omits technical details that the reference expects:

- 'corn in bulk' -> reference: 'Corn, stowage factor 51-52, without guarantee'
- 'Salt in big bags' -> reference: 'Salt in big bags, dimensions 1.1m x 1.1m x 1.1m, unit weight 1.25 MT'
- 'PC Strand' -> reference: 'PC Strand, Diameter: 130-140 cm, H: 80 cm, Unit Weight: 3-3.5 MT, Tier limit: 2'

Root cause: Rules 2 and 12 contradict each other.

- Rule 2: Include stowage factor inline if given (with original units)
- Rule 12: Do NOT include unit notations (ft3/MT, m3/MT) inside cargo_description
  Model resolves contradiction by omitting stowage from cargo_description entirely.

### Cluster B -- Wrong abbreviation expansion (approx 15 fails, ~5 unique items x 3 runs)

1. HRCTD factual error in prompt: says 'Trimmed and Dried' but correct is 'Trimmed and Descaled'
2. PNO not defined: model guesses 'Pickled and Oiled' instead of 'Plates Not Otherwise Specified'

Coverage: Cluster A + B = 54/69 = 78% of all fails addressable.

## Changes (ONE file: lib/prompts/parse-cargo.ts)

1. Fix HRCTD abbreviation: 'Trimmed and Dried' -> 'Trimmed and Descaled'
2. Add PNO abbreviation: 'Plates Not Otherwise Specified (PNO)'
3. Fix rule 2: clarify stowage factor NUMBER (no units) goes in cargo_description,
   full 'X ft3/MT' goes in stowage_factor field; both populated independently
4. Strengthen BULK rule: stowage factor in cargo_description is MANDATORY when stated
5. Strengthen BAGGED rule: dimensions + unit weight MANDATORY in cargo_description when stated
6. Add clarifying examples

## Expected Delta

Conservative (50% LLM compliance for A, 90% for B): ~33/69 fails saved -> 91.9%
Acceptance gate: >=87% (>=+2.6pp from 84.4 baseline)
Soft-merge: 85-86.9% (direction-correct, like R1)

## Anti-regression

Ports / weight / laycan / commission >= R22 - 1pp each.

## PI3 Status

Only lib/prompts/parse-cargo.ts modified. No test expectations changed. PI3 not triggered.
