# Spec 02: Rate Intelligence in Draft Quote

> Batch: 1 | Complexity: medium | Est: 25 min | Files: 5

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** AI draft quote in app/api/ai/draft-quote/, component in components/request/
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — FreightRateRecord, RateIntelligence types

## Requirements

### Rate Intelligence Service (TZ-014, audit item #1)

1. Create `lib/rate-intelligence.ts`:
   - Function `extractRatesFromRecaps(recaps: ParsedFixtureRecap[]): FreightRateRecord[]`
     - For each parsed fixture recap, extract: route (loadPort → dischPort), rateValue, rateBasis, currency, date
     - Normalize port names to regions (e.g., "Constanta" → "Black Sea", "Ravenna" → "Med")
   - Function `findRelevantRates(loadRegion: string, dischRegion: string, records: FreightRateRecord[]): RateIntelligence`
     - Match by region pair (exact or partial match)
     - If records found → trend = compare latest vs previous (rising/falling/stable)
     - Generate suggestion text: "Historical rate: $18.50/MT (Constanta→Ravenna, Sep 2025)"
     - If no records → trend = 'insufficient_data', suggestion = "[RATE TO BE CONFIRMED]"

2. Modify `app/api/ai/draft-quote/route.ts`:
   - Before generating draft, call `findRelevantRates()` with load/discharge regions from parsed cargo
   - Pass RateIntelligence to the AI prompt as context
   - In the prompt: if historical rate exists, use "Budgetary freight indication: ~$XX/MT (based on recent fixtures)" instead of "[RATE TO BE CONFIRMED]"

3. Modify `components/request/draft-quote-card.tsx`:
   - If RateIntelligence is available, show a small info box above the draft:
     "Rate Intelligence: $18.50/MT on similar route (Sep 2025) — trend: stable"
   - Use shadcn/ui Alert component with info variant

4. Create `lib/__tests__/rate-intelligence.test.ts`:
   - Test extractRatesFromRecaps with sample fixture recaps
   - Test findRelevantRates matching and suggestion generation

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/rate-intelligence.ts` | create | Rate intelligence service |
| `lib/__tests__/rate-intelligence.test.ts` | create | Tests |
| `app/api/ai/draft-quote/route.ts` | modify | Add rate context to prompt |
| `components/request/draft-quote-card.tsx` | modify | Show rate intelligence box |
| `lib/prompts.ts` | modify | Add rate intelligence prompt section |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/parsers/*` — managed by spec-01
- `app/api/ai/classify/*` — managed by spec-01
- `lib/currency.ts` — managed by spec-00

## Acceptance Criteria

- [ ] extractRatesFromRecaps extracts rates from sample fixture recaps
- [ ] findRelevantRates returns suggestion with historical rate for matching route
- [ ] Draft Quote for route with existing recap data shows "$XX/MT" instead of "[RATE TO BE CONFIRMED]"
- [ ] Rate Intelligence info box visible above draft quote when data available
- [ ] Routes with no history still show "[RATE TO BE CONFIRMED]"
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Import FreightRateRecord, RateIntelligence from lib/types.ts
- Do NOT modify the core draft quote structure — only add rate context
- Follow existing component patterns in components/request/

## How to Execute

1. Read this spec fully before starting
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 is merged: `git log --oneline -5`
5. `git checkout -b spec/spec-02-rate-intelligence`
6. Implement requirements in order
7. `npm test`
8. `npx tsc --noEmit`
9. `git add lib/rate-intelligence.ts lib/__tests__/rate-intelligence.test.ts app/api/ai/draft-quote/ components/request/ lib/prompts.ts && git commit -m "spec-02: rate intelligence in draft quote"`
10. `git push -u origin spec/spec-02-rate-intelligence`

IMPORTANT: Do NOT merge into main.
