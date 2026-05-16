# Phase 1 Scope -- parse-cargo R3

## Assumptions (Karpathy #1)

Понимаю задачу как: точечная правка CARGO DESCRIPTION RULES секции в одном файле.
Альтернатива: переписать всю секцию или добавить few-shot примеры.
Иду по точечной правке, потому что: fewer changes = less risk of side effects; targeted fixes for identified root causes.

## Affected Files

| File                       | Change                                              | Risk |
| -------------------------- | --------------------------------------------------- | ---- |
| lib/prompts/parse-cargo.ts | 6 targeted edits in CARGO DESCRIPTION RULES section | LOW  |

No other files touched.

## Boundaries

- Can Change: lines 130-160 (CARGO DESCRIPTION RULES section)
- Cannot Change: stowage_factor field rules (lines 161-175), LAYCAN RULES, test files
- Must Not Break: laycan match (currently 86.4% post-R1), commission/weight/ports fields

## Changes Detail

### Change 1: HRCTD abbreviation fix (line ~137)

FROM: 'HRCTD' -> 'Hot Rolled Coils Trimmed & Dried (HRCTD)'
TO: 'HRCTD' -> 'Hot Rolled Coils Trimmed & Descaled (HRCTD)'
Why: factual error in prompt. Affects ~15 fails (Cluster B).

### Change 2: Add PNO abbreviation (after HRCPO line)

ADD: '- PNO -> Plates Not Otherwise Specified (PNO)'
Why: PNO undefined -> model guesses wrong expansion. Affects ~3 fails.

### Change 3: Fix rule 2 -- stowage factor duplication (lines 142-143)

REPLACE current rule 2 with clarified version:
'2. Stowage factor: the numeric value (without units) MUST appear in cargo_description
when stated in the email, e.g. stowage factor 51-52, without guarantee.
The full 'X ft3/MT' notation also goes in the separate stowage_factor field.
These are independent: both fields must be populated. Do not omit stowage from
cargo_description because it is already in stowage_factor.'
Why: rules 2 and 12 contradicted each other, causing model to omit stowage entirely.

### Change 4: BULK mandatory rule (after rule 10)

ADD: '10a. For BULK cargo: if stowage factor is stated, it is MANDATORY in cargo_description.'
Example: corn with 'stw 51' -> 'Corn, stowage factor 51, without guarantee'

### Change 5: BAGGED mandatory rule (after rule 10a)

ADD: '10b. For BAGGED cargo: if bag dimensions or unit weight are stated, they are MANDATORY.'
Example: 'salt bb 1.1x1.1x1.1m uw 1.25mt' -> 'Salt in big bags, dimensions 1.1m x 1.1m x 1.1m, unit weight 1.25 MT'

### Change 6: Additional example showing stowage in cargo_description

ADD to examples block: shows bulk grain with stowage factor correctly included.

## PI3 Enforcement

Only lib/prompts/parse-cargo.ts changes. No test files touched. Tests do not assert prompt content directly.
PI3 threshold: >5 test expectation rewrites = STOP. Expected here: 0.

## Acceptance Gate

- cargo_description >= 87.0% (R23-A median over 3 runs)
- Soft-merge if 85.0-86.9% (direction-correct)
- Revert if < 85.0%
- Anti-regression: laycan >= 85.4%, all other fields >= R22 - 1pp
