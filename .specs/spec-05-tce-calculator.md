# Spec 05: TCE / Voyage Calculator Page

> Batch: 2 | Complexity: medium | Est: 30 min | Files: 6

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** App Router pages in app/, shared types in lib/types.ts
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — VoyageEstimation type
- `lib/constants.ts` — BUNKER_DEFAULTS, VESSEL_CLASS constants

## Requirements

### TCE Calculator (TZ-015, audit item #5)

1. Create `lib/voyage-calculator.ts`:
   - Function `calculateVoyage(params): VoyageEstimation` with params:
     - freightRate, quantity, currency (from cargo)
     - loadPort, dischPort (for distance calc)
     - vesselType: 'handysize' | 'supramax' | 'panamax' | 'capesize'
     - speed (kn), consumption (MT/day), bunkerPrice ($/MT)
     - portDays, canalDays (user inputs)
     - commissionPercent
   - Calculation logic:
     - grossFreight = freightRate * quantity (per_mt) or freightRate (lumpsum)
     - commission = grossFreight * commissionPercent / 100
     - netFreight = grossFreight - commission
     - seaDays = distance / (speed * 24) (distance from hardcoded major routes table)
     - totalDays = seaDays + portDays + canalDays
     - bunkerCost = consumption * totalDays * bunkerPrice
     - tce = (netFreight - bunkerCost - portCosts - canalTolls) / totalDays
     - verdict: tce > 5000 → 'profitable', tce > 0 → 'marginal', tce < 0 → 'loss'

2. Create `lib/voyage-distances.ts`:
   - Hardcoded distance table for 20 major routes (NM):
     - Santos→Qingdao: 12,500 NM
     - Constanta→Ravenna: 1,100 NM
     - Casablanca→WAfrica: 2,500 NM
     - etc. (at least 20 route pairs)
   - Function `getDistance(loadPort: string, dischPort: string): number | null`
   - Fuzzy match port names (case-insensitive, partial match)

3. Create `app/voyage-calc/page.tsx`:
   - Form with inputs: vessel type (select), load port, disch port, freight rate, quantity, speed, consumption, bunker price, port days, canal days, commission %
   - Pre-fill defaults from BUNKER_DEFAULTS by vessel type
   - "Calculate" button → run calculateVoyage()
   - Results card showing: Net Freight, Total Days breakdown, Bunker Cost, TCE, verdict
   - Verdict badge: green "PROFITABLE" / yellow "MARGINAL" / red "LOSS"
   - Use shadcn/ui Card, Input, Select, Button, Badge

4. Add navigation link to voyage calc from dashboard and fixture recap pages (create link component)

5. Create `lib/__tests__/voyage-calculator.test.ts`:
   - Test Supramax Santos→Qingdao scenario from TZ-015 spec
   - Test verdict thresholds
   - Test distance lookup

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/voyage-calculator.ts` | create | TCE calculation engine |
| `lib/voyage-distances.ts` | create | Distance lookup table |
| `lib/__tests__/voyage-calculator.test.ts` | create | Tests |
| `app/voyage-calc/page.tsx` | create | Calculator page |
| `app/voyage-calc/layout.tsx` | create | Page layout |
| `components/voyage/voyage-result-card.tsx` | create | Results display component |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/constants.ts` — managed by spec-00 (use, don't modify)
- `lib/parsers/*` — managed by spec-01
- `app/fixture/*` — managed by spec-04 and spec-06
- `app/commission/*` — managed by spec-03
- `components/request/*` — managed by spec-02
- `components/recap/*` — managed by spec-04

## Acceptance Criteria

- [ ] /voyage-calc page loads without 404
- [ ] Selecting vessel type pre-fills speed + consumption defaults
- [ ] Calculate button returns TCE number
- [ ] Santos→Qingdao supramax test case returns loss (as in TZ-015 spec)
- [ ] Verdict shows correct color badge
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Import VoyageEstimation from lib/types.ts
- Use shadcn/ui components
- Distance table can be hardcoded (no external API needed for demo)

## How to Execute

1. Read this spec fully
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 is merged
5. `git checkout -b spec/spec-05-tce-calculator`
6. Implement requirements in order
7. `npm test && npx tsc --noEmit`
8. `git add lib/voyage-calculator.ts lib/voyage-distances.ts lib/__tests__/voyage-calculator.test.ts app/voyage-calc/ components/voyage/ && git commit -m "spec-05: TCE voyage calculator page"`
9. `git push -u origin spec/spec-05-tce-calculator`

IMPORTANT: Do NOT merge into main.
