# Spec 03: Currency Handling EUR→USD in Commission

> Batch: 1 | Complexity: simple | Est: 20 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Commission page at app/commission/page.tsx
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — CurrencyConversion type
- `lib/currency.ts` — convertCurrency(), formatCurrencyAmount()

## Requirements

### Fix Currency in Commission Breakdown (TZ-016, audit item #2)

1. Modify `app/commission/page.tsx` (or the commission calculation logic):
   - When a fixture recap has freight in non-USD currency (e.g., EUR):
     - Show original currency: "3.75% x EUR 139,500"
     - Below: show USD equivalent: "≈ USD 150,660 (rate: 1.08)"
     - Total commission shows both: "EUR 5,231 ≈ USD 5,649"
   - Call convertCurrency() from lib/currency.ts for conversions

2. Modify `app/api/commission/route.ts` (or wherever commission data is prepared):
   - Detect currency from fixture recap freight field (already parsed: "EUR 31.00/mt")
   - If currency != USD → call convertCurrency(amount, currency, 'USD')
   - Return both original and converted amounts in API response
   - Add `convertedTotal` field to commission response

3. Modify commission UI component:
   - Multi-currency total shows: "USD: $8,901 + EUR: €5,231 (≈$5,649) = ~$14,550 USD"
   - Use formatCurrencyAmount() for consistent formatting

4. Create test for commission currency handling:
   - EUR freight → commission shows EUR amount + USD equivalent
   - USD freight → no conversion needed
   - Mixed currencies → total correctly aggregated in USD

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/commission/page.tsx` | modify | Show EUR + USD equivalent |
| `app/api/commission/route.ts` | modify | Add currency conversion to API |
| `components/commission/commission-card.tsx` | create or modify | Multi-currency display |
| `lib/__tests__/commission.test.ts` | create | Test currency in commission |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/currency.ts` — managed by spec-00 (use, don't modify)
- `lib/parsers/*` — managed by spec-01
- `components/request/*` — managed by spec-02
- `app/api/ai/*` — managed by other specs

## Acceptance Criteria

- [ ] NORTHSTAR GLORY recap (EUR 31/mt) shows "EUR 139,500" not "USD 139,500"
- [ ] USD equivalent shown below: "≈ USD 150,660 (rate: 1.08)"
- [ ] Total commission correctly sums EUR→USD conversions
- [ ] USD-only recaps unchanged (no conversion shown)
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Import CurrencyConversion from lib/types.ts, convertCurrency from lib/currency.ts
- Do NOT modify the commission calculation logic — only add currency display
- Follow existing component patterns

## How to Execute

1. Read this spec fully before starting
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 is merged: `git log --oneline -5`
5. `git checkout -b spec/spec-03-currency`
6. Implement requirements in order
7. `npm test`
8. `npx tsc --noEmit`
9. `git add app/commission/ components/commission/ lib/__tests__/commission.test.ts && git commit -m "spec-03: fix currency EUR→USD in commission"`
10. `git push -u origin spec/spec-03-currency`

IMPORTANT: Do NOT merge into main.
