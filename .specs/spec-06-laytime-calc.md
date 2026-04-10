# Spec 06: Laytime Calculator Widget in Fixture Recap

> Batch: 2 | Complexity: medium | Est: 25 min | Files: 5

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Fixture recap at app/fixture/[id]/page.tsx
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation, spec-04-subs-timer (because spec-04 also modifies fixture page)

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — types
- `app/fixture/[id]/page.tsx` — already modified by spec-04 (subs timer added)

## Requirements

### Laytime Calculator (TZ-009, audit item #6)

1. Create `lib/laytime-calculator.ts`:
   - Function `calculateLaytime(params): LaytimeResult` with params:
     - loadingRate: number (MT/day)
     - dischargingRate: number (MT/day)
     - loadingTerms: 'SHINC' | 'SHEX' | 'SSHEX'
     - dischargingTerms: 'SHINC' | 'SHEX' | 'SSHEX'
     - quantity: number (MT)
     - actualLoadingDays: number (user input)
     - actualDischargingDays: number (user input)
     - demurrageRate: number ($/day)
     - dispatchRate?: number ($/day, default = demurrageRate / 2)
   - Calculation:
     - allowedLoadingDays = quantity / loadingRate
     - allowedDischargingDays = quantity / dischargingRate
     - totalAllowed = allowedLoadingDays + allowedDischargingDays
     - totalActual = actualLoadingDays + actualDischargingDays
     - difference = totalActual - totalAllowed
     - if difference > 0: demurrage = difference * demurrageRate
     - if difference < 0: dispatch = abs(difference) * dispatchRate
   - Return: { allowedDays, actualDays, difference, demurrage?, dispatch?, explanation }

2. Create `components/laytime/laytime-widget.tsx`:
   - Expandable widget inside fixture recap (below Demurrage section)
   - Pre-fills from parsed recap data: loading rate, discharge rate, terms, quantity, demurrage rate
   - User inputs: actual loading days, actual discharging days
   - "Calculate" button
   - Result card:
     - Allowed: X.XX days (loading: X.XX + discharge: X.XX)
     - Actual: X.XX days
     - Result: "Demurrage: $X,XXX" (red) or "Dispatch: $X,XXX" (green)
   - Use shadcn/ui Collapsible, Card, Input, Button

3. Modify `app/fixture/[id]/page.tsx`:
   - Import LaytimeWidget
   - Render below Demurrage section (after SubsTimer from spec-04)
   - Pass parsed laytime data (loadingRate, dischargingRate, terms, quantity, demurrageRate)

4. Create `lib/__tests__/laytime-calculator.test.ts`:
   - Test basic demurrage calculation
   - Test dispatch (vessel finishes early)
   - Test PDPR (pro-rata partial days)

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/laytime-calculator.ts` | create | Calculation engine |
| `lib/__tests__/laytime-calculator.test.ts` | create | Tests |
| `components/laytime/laytime-widget.tsx` | create | UI widget |
| `components/laytime/laytime-result.tsx` | create | Result display |
| `app/fixture/[id]/page.tsx` | modify | Add LaytimeWidget |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/parsers/*` — managed by spec-01
- `components/recap/subs-timer.tsx` — managed by spec-04 (already merged)
- `app/commission/*` — managed by spec-03
- `app/voyage-calc/*` — managed by spec-05

## Acceptance Criteria

- [ ] Widget appears in fixture recap page (expandable/collapsible)
- [ ] Pre-fills loading/discharging rates from parsed data
- [ ] User enters actual days → calculate → shows demurrage or dispatch
- [ ] Demurrage in red, dispatch in green
- [ ] Calculation matches manual check: 7000 MT / 3000 MT/day = 2.33 allowed loading days
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- app/fixture/[id]/page.tsx was already modified by spec-04 — add LaytimeWidget BELOW SubsTimer
- Use shadcn/ui components
- Follow existing component patterns

## How to Execute

1. Read this spec fully
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 AND spec-04 are merged: `git log --oneline -10`
5. `git checkout -b spec/spec-06-laytime-calc`
6. Implement requirements in order
7. `npm test && npx tsc --noEmit`
8. `git add lib/laytime-calculator.ts lib/__tests__/laytime-calculator.test.ts components/laytime/ app/fixture/ && git commit -m "spec-06: laytime calculator widget in fixture recap"`
9. `git push -u origin spec/spec-06-laytime-calc`

IMPORTANT: Do NOT merge into main.
