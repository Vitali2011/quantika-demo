# Spec 01: Parser Fixes — Geared/Gearless + Time Charter Classification

> Batch: 1 | Complexity: simple | Est: 20 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Parsers in lib/parsers/, AI classification in app/api/ai/classify/
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — ParsedTimeCharterRecap type

## Requirements

### Bug Fix: Geared/Gearless (audit item #4)

1. In `lib/parsers/vessel-parser.ts`, fix the geared/gearless detection:
   - Current bug: "Gearless (shore cranes required)" → `geared: true` (WRONG)
   - Fix: detect keywords "gearless", "no gear", "cranes required", "shore cranes" → `geared: false`
   - Detect "geared", "has cranes", "deck cranes" → `geared: true`
   - If not mentioned → `geared: undefined` (unknown)

2. In `lib/parsers/__tests__/vessel-parser.test.ts`, add tests:
   - "Gearless (shore cranes required)" → geared: false
   - "Geared 4x30mt cranes" → geared: true
   - No mention of gear → geared: undefined

### Feature: Time Charter Classification (audit item #8, TZ-011)

3. In `app/api/ai/classify/route.ts` (or the classification logic file), add TC detection markers:
   - If subject/body contains: "DELY", "REDELY", "hire", "per day", "pdpr", "NYPE", "TCT", "time charter", "TC trip" → classify as `TIME_CHARTER`
   - TC classification takes priority over BULK for emails with both markers

4. In `lib/parsers/fixture-parser.ts`, add TC-specific field extraction:
   - When email is classified as TIME_CHARTER, additionally extract:
     - deliveryPort (from "DELY:" or "delivery:")
     - redeliveryPort (from "REDELY:" or "redelivery:")
     - duration (from "DURATION:" — parse "11-13 months" → {min: 11, max: 13, unit: "months"})
     - hireRate (from "HIRE:" or "Rate:" with "pdpr" or "per day")
   - Return ParsedTimeCharterRecap type (from spec-00)

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/parsers/vessel-parser.ts` | modify | Fix geared/gearless detection |
| `lib/parsers/__tests__/vessel-parser.test.ts` | modify | Add geared/gearless tests |
| `app/api/ai/classify/route.ts` | modify | Add TIME_CHARTER classification markers |
| `lib/parsers/fixture-parser.ts` | modify | Add TC field extraction |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/currency.ts` — managed by spec-00
- `components/*` — managed by other specs
- `app/api/ai/draft-quote/*` — managed by spec-02

## Acceptance Criteria

- [ ] "Gearless" vessel → geared: false in parsed output
- [ ] "Geared 4x30mt cranes" → geared: true
- [ ] Email with "DELY WAFR" + "REDELY S'PORE" + "1 TCT" → classified as TIME_CHARTER
- [ ] TC recap extracts deliveryPort, redeliveryPort, duration
- [ ] Existing CARGO_INQUIRY and VESSEL_POSITION classifications still work
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Do NOT break existing parser behavior
- Import ParsedTimeCharterRecap from lib/types.ts (created in spec-00)
- Follow existing parser patterns

## How to Execute

1. Read this spec fully before starting
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 is merged (already done): `git log --oneline -5`
5. `git checkout -b spec/spec-01-parser-fixes`
6. Implement requirements in order
7. `npm test`
8. `npx tsc --noEmit`
9. `git add lib/parsers/ app/api/ai/classify/ && git commit -m "spec-01: fix geared/gearless + add TC classification"`
10. `git push -u origin spec/spec-01-parser-fixes`

IMPORTANT: Do NOT merge into main.
