# recon-currency — Root Cause + Fix Plan

**Audit-2 finding.** A non-EUR, non-USD currency (e.g. GBP) is displayed as a dollar sign.

---

## ROOT CAUSE

`lib/commission.ts:119` — binary EUR/USD detection:

```ts
const currency = /EUR|€/i.test(fullFreightStr) ? 'EUR' : 'USD';
```

`fullFreightStr` = `freightRate + " " + freightBasis` (both the AI string field).  
Anything that is not EUR (e.g. "GBP 30 pmt", "£30 pmt") silently maps to `'USD'`.

The `currency` variable is used:
- **line 119** — primary detection
- **line 123** — fallback when AI did not supply `commissionCurrency`  
  (`commissionCurrency = recap.commissionCurrency || currency`)
- **line 165/167** — non-precomputed path: `freightCurrency: currency` and `commissionCurrency: currency`

Note: the precomputed-amount path (lines 125–136) correctly uses `commissionCurrency` (which may carry
the AI-extracted value), but **still sets `freightCurrency: commissionCurrency` at line 133**,
meaning GBP → USD there too if the AI did not fill `commission_currency`.

---

## CURRENCY DETECTION CALL-SITES

| # | File:line | What it detects | Bug? |
|---|-----------|----------------|------|
| 1 | `lib/commission.ts:119` | Regex `/EUR\|€/i` on `freightRate+freightBasis` string → `'EUR'\|'USD'` | **YES** — GBP/NOK/etc. → USD |
| 2 | `lib/commission.ts:123` | Fallback: `recap.commissionCurrency \|\| currency` | Depends on #1 when AI doesn't supply field |
| 3 | `lib/parsing/parse-recap-helpers.ts:134` | Passes `result.commission_currency` from AI JSON through `extractStrField` → `commissionCurrency` on `ParsedFixtureRecap` | OK (correct; relies on AI) |
| 4 | `lib/prompts/parse-recap.ts:125,213` | Prompts AI to fill `commission_currency` | OK (instruction exists; AI may or may not fill it) |

---

## CURRENCY RENDER CALL-SITES

| # | File:line | Pattern | Bug? |
|---|-----------|---------|------|
| 1 | `app/commission/page.tsx:63` | `t.currency === 'EUR' ? '€' : '$'` on `totalByCurrency` | **YES** — GBP → `$GBP amount` |
| 2 | `app/summary/page.tsx:39` | Same ternary on `totalByCurrency` → used in commissionTotal string | **YES** |
| 3 | `app/commission/page.tsx:47,50` | Raw `d.freightCurrency` / `d.commissionCurrency` codes rendered as-is (no symbol) | OK — prints the code, not a symbol |
| 4 | `app/fixture/[id]/page.tsx:65` | `safeRender(recap.commissionCurrency) \|\| '$'` | **PARTIAL** — fallback is `'$'` literal when AI field is null; correct when AI fills it |
| 5 | `app/fixture/[id]/page.tsx:200,210,220` | Same `safeRender(recap.commissionCurrency) \|\| '$'` | **PARTIAL** — same as #4 |

Bug-trigger summary:
- Sites 1 & 2: would show `$` for any currency other than EUR (e.g. GBP → `$12,345.00`).
- Sites 4 & 5: show literal `'$'` when AI returns no `commission_currency`. Would show correct code when AI fills it as `GBP`, but would still not show `£`.

---

## EXISTING CURRENCY-TO-SYMBOL UTILITY

`lib/currency.ts:118` — `formatCurrencyAmount(amount: number, currency: string): string`

```ts
if (currency === "USD") return `${sign}$${formatted}`;
return `${sign}${currency} ${formatted}`;   // GBP → "GBP 1,234.00", EUR → "EUR 1,234.00"
```

**Note:** This utility uses the currency *code*, not a Unicode symbol (€, £). It's multi-currency safe 
but slightly verbose for EUR/GBP (shows "EUR" not "€"). The test at `lib/__tests__/currency.test.ts:173`
explicitly expects `"EUR 1,234.50"` (not `"€1,234.50"`). This is a fine UX choice; the main fix is
correctness over style.

An optional SYMBOL_MAP could be added (`{ USD: '$', EUR: '€', GBP: '£' }`) for stylistic parity,
but is not required for correctness. Use `formatCurrencyAmount` to centralize — don't invent a new map.

---

## DO ANY CURRENT RECAPS TRIGGER THE BUG?

**No.** Analysis of all 14 live sessions in `data/sessions.db` + all 154 emails in the demo session:

- All `parsedFixtureRecaps` arrays are empty in production sessions (no recap emails processed yet).
- Demo session: `parsedFixtureRecaps: []` — demo-seed.db is an empty file (0 bytes), not yet seeded.
- `data/sessions.db` → `ai_audit` table returned no `commission_currency` values for GBP/other.
- `lib/sample-data/fixture-recaps.json` (3 emails): both EUR-denominated fixtures ("EURO 30 PMT",
  "EURO 28 PMT"). No GBP freight in any sample email.

**Conclusion: bug is defensive.** No current data triggers it. Fix is still warranted because:
1. Real-world UK-route fixtures (e.g. Teignmouth) do occur with GBP freight.
2. The sample fixture `fixture-recaps.json` already contains GBP-neighbor ports (Teignmouth, Cardiff).
3. Code path is reachable as soon as any user processes a GBP-denominated recap.

---

## IS commissionCurrency PERSISTED?

`commissionCurrency` is **not** persisted to any DB column. It lives:

1. **In session memory** (`SessionData.commissionSummary`) — recomputed on each `parse-recap` call
   (`app/api/ai/parse-recap/route.ts:86`) and on demo hydration
   (`lib/demo-mode/hydrate-demo-session.ts:246`) via `summarizeCommissions(parsedFixtureRecaps)`.

2. **On `ParsedFixtureRecap`** (stored in session JSON) — the raw AI-extracted `commissionCurrency`
   field from `lib/parsing/parse-recap-helpers.ts:134`.

The `CommissionResult` (returned from `calculateCommission`) and `CommissionSummary` are ephemeral:
derived on every hydration from the stored `parsedFixtureRecaps`. No `commission_currency` column
exists in `parsed_results` or `sessions`.

---

## FIX PLAN

### Step 1 — Fix detection in `lib/commission.ts:119`

Replace the binary EUR/USD regex with a proper multi-currency detector:

```ts
// Before:
const currency = /EUR|€/i.test(fullFreightStr) ? 'EUR' : 'USD';

// After:
function detectFreightCurrency(s: string): string {
  if (/EUR|€/i.test(s)) return 'EUR';
  if (/GBP|£|sterling/i.test(s)) return 'GBP';
  if (/NOK\b/i.test(s)) return 'NOK';
  if (/JPY|¥/i.test(s)) return 'JPY';
  // default
  return 'USD';
}
const currency = detectFreightCurrency(fullFreightStr);
```

Keep this function private in `commission.ts` — it's the only caller, and extending it later is easy.

### Step 2 — Fix render sites in `app/commission/page.tsx:63` and `app/summary/page.tsx:39`

Replace the EUR ternary with `formatCurrencyAmount` from `lib/currency.ts`:

```ts
// Before (commission/page.tsx:63):
~{t.currency === 'EUR' ? '€' : '$'}{formatNumber(t.amount)}

// After:
~{formatCurrencyAmount(t.amount, t.currency)}
```

```ts
// Before (summary/page.tsx:39):
.map(t => `${t.currency === 'EUR' ? '€' : '$'}${formatNumber(t.amount)}`)

// After:
.map(t => formatCurrencyAmount(t.amount, t.currency))
```

Both pages need `import { formatCurrencyAmount } from '@/lib/currency';`.

### Step 3 — Fix fallback in `app/fixture/[id]/page.tsx:65,200,210,220`

Replace `safeRender(recap.commissionCurrency) || '$'` with a helper that produces a proper symbol:

```ts
// Helper (inline or import from lib/currency):
function currencyPrefix(code: string | null | undefined): string {
  if (!code) return '$';
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  return code + ' '; // e.g. "GBP 12,345"
}
```

Or simply use `formatCurrencyAmount` directly: `formatCurrencyAmount(recap.commissionAmount!, recap.commissionCurrency ?? 'USD')`.

### Step 4 — Add test coverage

Add to `lib/__tests__/commission.test.ts`:

```ts
it('detects GBP currency from freight rate string', () => {
  const recap = baseRecap({
    freightRate: { value: '30', confidence: 'confirmed' },
    freightBasis: 'GBP pmt',
    cargoQuantityMax: 3000,
    commissionPercent: 3.75,
  });
  const result = calculateCommission(recap);
  expect(result).not.toBeNull();
  expect(result!.freightCurrency).toBe('GBP');
  expect(result!.commissionCurrency).toBe('GBP');
});

it('falls back to USD for unknown currency', () => {
  const recap = baseRecap({
    freightRate: { value: '300000', confidence: 'confirmed' },
    freightBasis: 'lumpsum',
    commissionPercent: 5,
  });
  const result = calculateCommission(recap);
  expect(result!.freightCurrency).toBe('USD');
});
```

---

## SUMMARY

| Item | Status |
|------|--------|
| Root cause | `lib/commission.ts:119` — binary EUR/USD ternary |
| Detection sites | 2 (commission.ts:119 + :123 fallback) |
| Render sites with bug | 4: commission/page:63, summary/page:39, fixture/[id]/page:65,200,210,220 |
| Existing utility to reuse | `formatCurrencyAmount` in `lib/currency.ts:118` |
| `commissionCurrency` persisted? | No — session memory only, recomputed on hydration |
| Current data triggers bug? | **No** — all sessions have 0 recaps; fix is defensive |
| Files to change | `lib/commission.ts`, `app/commission/page.tsx`, `app/summary/page.tsx`, `app/fixture/[id]/page.tsx`, `lib/__tests__/commission.test.ts` |
