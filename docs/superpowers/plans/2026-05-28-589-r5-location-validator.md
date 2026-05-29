# #589 R5 — Location/Port Validation Gap

## Контекст (diag R5 targets)
Validator strips class society (DNV/LR/etc) + numbers (50000 MT) — это R3/R3b/Wave3.
Но Gemini продолжает выдумывать **location tokens**: "Singapore", "Constanta", "Rotterdam", "China" в narration когда они НЕ из payload.

QA-walker verdict: на /match/127 (actual route CNSHA → NLRTM) AI говорит "open position in Singapore" — Singapore не в payload.

## Approach
1. Pass payload locations в stripInventedContent — extract `vessel.openPosition.value`, `cargo.originPort.value`, `cargo.destinationPort.value` (also nested vesselName.value etc — context-aware as в BC7).
2. Build allowedLocationsUpper Set из этих фактических values.
3. Add port/city detection in narration:
   - Regex for known port patterns: `\b(at|in|from|to|via)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b`
   - OR pre-defined PORT_NAMES list (Singapore, Rotterdam, Constanta, China, Brazil, etc.) — top 100 ports
4. For each match, if location NOT in allowedLocationsUpper AND NOT part of vessel.vesselName (BC7 rule) → strip.

## Files (2-3)
- `lib/explain-deal-validator.ts` (+10-20 lines)
- `__tests__/progonq-explain-deal-regression.test.ts` (+30 lines, 5-8 new tests)
- Possibly `lib/locations/port-names.ts` (new — list of port tokens to check)

## Tests (failing FIRST)
- 'Singapore' invented (payload openPosition=CNSHA) → must strip
- 'Constanta' invented (payload originPort=NLRTM) → must strip
- 'Rotterdam' real (payload destinationPort=NLRTM=Rotterdam) → must preserve
- 'MV Singapore Star' vessel name → preserve (BC7-style)
- Mixed: real port + invented port → strip only invented

## Tier M (validator territory + Risk-override)
## Out-of-scope
- Refactor validator architecture
- Add new schema fields
- /api/ai endpoint changes

## Exit
- All new tests green + existing 87/87 still green (no regression)
- PR target main + label code-only + /test-skill cold-QA mandatory

## First step
- TDD: failing test 'Singapore' invented → red → impl → green
