# Spec 07: FCL/LCL Container Module + Sample Data

> Batch: 2 | Complexity: medium | Est: 30 min | Files: 7

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Sample data in lib/sample-data.ts (or similar), parsers in lib/parsers/
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — ContainerSpec type

## Requirements

### FCL/LCL Module (TZ-010, audit item #7)

1. Create `lib/parsers/container-parser.ts`:
   - Function `parseContainerInquiry(emailBody: string): ParsedContainerCargo`
   - Detect container types: 20GP, 40GP, 40HC, 20RF, 40RF, etc.
   - Parse TEU: 20ft = 1 TEU, 40ft = 2 TEU
   - Parse W/M (weight/measure) for LCL: weight in kg vs volume in cbm → billing basis
   - Parse surcharges: THC, BAF, CAF, PSS, ISPS, etc. (store as list)
   - Parse incoterms: FOB, CIF, CFR, EXW
   - Detect FCL vs LCL: explicit mention or container type = FCL, "loose cargo" / "consolidation" = LCL

2. Add FCL/LCL sample data to `lib/sample-data.ts`:
   - Add 2 container emails to sample data array:
     - FCL: "20x40HC Shanghai → Rotterdam, Electronics, CIF, THC+BAF included"
     - LCL: "5 CBM / 2,500 kg Delhi → Hamburg, consolidation, FOB"
   - Both with realistic shipping details

3. Create `app/container/[id]/page.tsx`:
   - Detail page for container inquiries
   - FCL view: container table (type, qty, weight, payload check) + surcharges list
   - LCL view: W/M calculation (weight vs volume → billing basis), rate estimate
   - TEU total displayed
   - "Draft Quote" button (reuse existing draft-quote flow)

4. Modify `app/api/ai/classify/route.ts`:
   - Add CONTAINER classification type
   - Detect keywords: "container", "TEU", "20GP", "40HC", "FCL", "LCL", "CBM", "consolidation"
   - Route to container-parser when classified as CONTAINER

5. Create `lib/__tests__/container-parser.test.ts`:
   - Test FCL parsing (20x40HC)
   - Test LCL parsing (5 CBM / 2,500 kg)
   - Test TEU calculation
   - Test surcharge extraction

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/parsers/container-parser.ts` | create | Container email parser |
| `lib/__tests__/container-parser.test.ts` | create | Tests |
| `lib/sample-data.ts` | modify | Add 2 container sample emails |
| `app/container/[id]/page.tsx` | create | Container detail page |
| `app/container/[id]/layout.tsx` | create | Page layout |
| `components/container/container-table.tsx` | create | FCL container table |
| `components/container/wm-calculator.tsx` | create | LCL W/M calc |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/parsers/vessel-parser.ts` — managed by spec-01
- `lib/parsers/fixture-parser.ts` — managed by spec-01
- `app/fixture/*` — managed by spec-04, spec-06
- `app/voyage-calc/*` — managed by spec-05
- `app/commission/*` — managed by spec-03
- `app/api/ai/classify/route.ts` — managed by spec-01 (CONFLICT — see note)

**Note on classify conflict:** Both spec-01 and spec-07 modify the classify route. Since spec-07 is Batch 2 (after spec-01 Batch 1 is merged), there's no conflict — spec-07 adds to what spec-01 already committed. Read the merged classify file and ADD container markers to the existing classification list.

## Acceptance Criteria

- [ ] Container sample emails appear in dashboard after "Try with Sample Data"
- [ ] FCL email → container detail page shows container table with TEU total
- [ ] LCL email → shows W/M calculation
- [ ] Container emails classified as CONTAINER type (not CARGO_INQUIRY)
- [ ] Container parser extracts: type, qty, weight, surcharges, incoterms
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Import ContainerSpec from lib/types.ts
- Read classify/route.ts before modifying — spec-01 already changed it
- Follow existing parser patterns
- Sample data format must match existing entries in lib/sample-data.ts

## How to Execute

1. Read this spec fully
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 AND spec-01 are merged: `git log --oneline -10`
5. `git checkout -b spec/spec-07-fcl-lcl`
6. Read existing lib/sample-data.ts to match format
7. Read existing app/api/ai/classify/route.ts (modified by spec-01)
8. Implement requirements in order
9. `npm test && npx tsc --noEmit`
10. `git add lib/parsers/container-parser.ts lib/__tests__/container-parser.test.ts lib/sample-data.ts app/container/ components/container/ app/api/ai/classify/ && git commit -m "spec-07: FCL/LCL container module with sample data"`
11. `git push -u origin spec/spec-07-fcl-lcl`

IMPORTANT: Do NOT merge into main.
