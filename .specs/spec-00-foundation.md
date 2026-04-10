# Spec 00: Foundation Types + Currency Utils

> Batch: 0 | Complexity: simple | Est: 15 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** App Router, API routes in app/api/, types in lib/types.ts
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

No dependencies. This spec can be executed immediately.

## Requirements

1. Add new types to `lib/types.ts`:

   ```typescript
   // TZ-008: Subs tracking
   interface SubjectItem {
     text: string;
     status: 'pending' | 'lifted' | 'expired' | 'failed';
     party?: string;
     deadline?: {
       hours: number;
       workingHours: boolean;
       calculatedExpiry?: string; // ISO date
     };
   }

   // TZ-014: Rate Intelligence
   interface FreightRateRecord {
     route: string;
     loadRegion: string;
     dischargeRegion: string;
     rateValue: number;
     rateBasis: 'LUMPSUM' | 'PER_MT' | 'PER_DAY';
     currency: string;
     vesselClass?: string;
     date: string;
     source: 'parsed_recap' | 'manual';
   }

   interface RateIntelligence {
     currentRate?: number;
     historicalRecords: FreightRateRecord[];
     trend: 'rising' | 'falling' | 'stable' | 'insufficient_data';
     suggestion: string;
   }

   // TZ-015: Voyage Calculator
   interface VoyageEstimation {
     grossFreight: number;
     commission: number;
     netFreight: number;
     totalDays: number;
     seaDays: number;
     portDays: number;
     canalDays: number;
     bunkerCost: number;
     portCosts: number;
     canalTolls: number;
     euEts?: number;
     tce: number;
     verdict: 'profitable' | 'marginal' | 'loss';
     currency: string;
   }

   // TZ-016: Multi-currency
   interface CurrencyConversion {
     originalAmount: number;
     originalCurrency: string;
     targetAmount: number;
     targetCurrency: string;
     exchangeRate: number;
     rateDate: string;
     source: 'ecb' | 'exchangerate_api' | 'manual';
   }

   // TZ-010: FCL/LCL
   interface ContainerSpec {
     type: string; // 20GP, 40HC, etc.
     quantity: number;
     weight?: number;
     cbm?: number;
     payload?: number;
   }

   // TZ-011: Time Charter
   interface ParsedTimeCharterRecap {
     vessel: string;
     owners: string;
     charterers: string;
     deliveryPort: string;
     redeliveryPort: string;
     duration: { min: number; max: number; unit: string };
     hireRate: { value: number; currency: string; unit: string };
     cargoExclusions?: string[];
     commission: string;
   }
   ```

2. Create `lib/currency.ts` — currency conversion utility:
   - Function `convertCurrency(amount: number, from: string, to: string): Promise<CurrencyConversion>`
   - Primary source: ECB free API (https://api.exchangerate.host/latest)
   - Fallback: hardcoded EUR/USD = 1.08 with source = 'manual'
   - Cache exchange rate for 24h (in-memory Map)
   - Function `formatCurrencyAmount(amount: number, currency: string): string` — formats as "$1,234.56" or "EUR 1,234.56"

3. Create `lib/__tests__/currency.test.ts`:
   - Test convertCurrency returns correct structure
   - Test formatCurrencyAmount formatting
   - Test cache works (second call uses cache)

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/types.ts` | modify | Add 7 new interfaces/types |
| `lib/currency.ts` | create | Currency conversion utility |
| `lib/__tests__/currency.test.ts` | create | Tests for currency utils |
| `lib/constants.ts` | modify | Add BUNKER_DEFAULTS, VESSEL_CLASS constants |

**Action legend:** create = new file | modify = edit existing

## Files FORBIDDEN

- `app/*` — managed by other specs
- `components/*` — managed by other specs
- `lib/parsers/*` — managed by spec-01

## Acceptance Criteria

- [ ] All new types exported from lib/types.ts
- [ ] convertCurrency returns CurrencyConversion object
- [ ] formatCurrencyAmount("1234.56", "USD") → "$1,234.56"
- [ ] formatCurrencyAmount("1234.56", "EUR") → "EUR 1,234.56"
- [ ] `npx tsc --noEmit` compiles without errors
- [ ] `npm test` passes

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Do NOT add features beyond the requirements
- Do NOT leave TODO, FIXME, placeholder, console.log
- Follow existing code style in lib/types.ts

## How to Execute

1. Read this spec fully before starting
2. `cd /root/quantika-demo && git checkout main && git pull`
3. `git checkout -b spec/spec-00-foundation`
4. Implement requirements in order
5. `npm test`
6. `npx tsc --noEmit`
7. `git add lib/types.ts lib/currency.ts lib/__tests__/currency.test.ts lib/constants.ts && git commit -m "spec-00: foundation types and currency utils"`
8. `git push -u origin spec/spec-00-foundation`

IMPORTANT: Do NOT merge into main. The merge session (Opus) handles all merges.
