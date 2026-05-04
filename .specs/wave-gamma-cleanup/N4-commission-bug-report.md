# N4 commission [object Object] reproduction (γ-cleanup-D)

## Repro: yes

## Setup
- demo.quantika.org URL: https://demo.quantika.org/dashboard
- Date/time: 2026-05-04
- Browser: Vitali macOS Chrome

## Steps to reproduce
1. Navigate to https://demo.quantika.org/dashboard (with an existing session that has fixture recap emails parsed)
2. Observe the "Commission from recaps" block in the green banner

## DOM evidence
```html
<p class="font-semibold text-green-800">
  Commission from recaps: ~USD 4,856 + ~[object Object] 5,225 + ~[object Object] 16,875 + ~[object Object] 3,480 + ~[object Object] 15,938
</p>
```

4 out of 5 commission totals show `[object Object]` where the currency code should be.
The first entry (`~USD 4,856`) renders correctly.

## Root cause

**Two-layer bug:**

### Layer 1 — AI response not coerced to string (primary cause)
**File:** `lib/parsing/parse-recap-helpers.ts:103`
```ts
commissionCurrency: result.commission_currency || null,
```
When the AI LLM returns `commission_currency` as a structured object (`{ "value": "USD", "confidence": "confirmed" }`) instead of a plain string, this line passes the object through as-is. TypeScript types say `string | null`, but at runtime a ConfidenceField-shaped object arrives.

### Layer 2 — calibrateAll silently promotes it to ConfidenceField
**File:** `lib/validation/confidence-calibration.ts:28-36`
```ts
export function calibrateAll<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (isConfidenceField(val)) {
      (result as Record<string, unknown>)[key] = calibrateConfidence(val);
    }
  }
  ...
}
```
`isConfidenceField` checks for `{ value, confidence }` shape. If AI returned `{ value: "USD", confidence: "confirmed" }` for `commission_currency`, it passes as a `ConfidenceField<string>` object. After `calibrateAll`, `recap.commissionCurrency` is now a `ConfidenceField` object, not a `string`.

### Layer 3 — commission.ts uses the raw value without coercion
**File:** `lib/commission.ts:45`
```ts
const commissionCurrency = recap.commissionCurrency || currency;
```
`recap.commissionCurrency` is truthy (it's a non-null object), so it bypasses the fallback `currency`. The object `{ value: "USD", confidence: "confirmed" }` becomes the map key in `byCurrency`.

**File:** `lib/commission.ts:102`
```ts
byCurrency.set(d.commissionCurrency, ...)
```
The map key is an object, not a string.

**File:** `lib/commission.ts:105`
```ts
Array.from(byCurrency.entries()).map(([currency, amount]) => ({
  currency,   // ← object here
  amount: ...
}))
```
`currency` is the ConfidenceField object. When rendered in JSX via template literal `` `~${t.currency} ${t.amount}` ``, JS coerces it to `[object Object]`.

**Why first entry works:** The first recap's `commissionCurrency` was either `null` (so fallback `currency` string is used) or happened to return as a plain string from the AI.

## Proposed fix

**Primary fix (parse-recap-helpers.ts:103):** Extract `commissionCurrency` as a plain string, not raw `result.commission_currency`. Use the same `extractStr` helper pattern or inline coercion:

```
commissionCurrency: (typeof result.commission_currency === 'string' ? result.commission_currency : null) || null
```

Or add an `extractStrField` util (similar to `extractNum`) that handles both plain strings and `{ value: string }` shaped objects:
```
function extractStrField(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v || null;
  if (typeof v === 'object' && v !== null && 'value' in v) return extractStrField((v as { value: unknown }).value);
  return null;
}
commissionCurrency: extractStrField(result.commission_currency),
```

**Secondary defensive fix (commission.ts:45):** Add a type guard so even if a bad value slips through:
```
const commissionCurrency = (typeof recap.commissionCurrency === 'string' ? recap.commissionCurrency : null) || currency;
```

This is defense-in-depth — the primary fix in parse-recap-helpers.ts should be sufficient.

**Note:** Other `string | null` fields that use `result.X || null` pattern (e.g. `commission_base`, `commission`, `freightBasis`, etc.) could have the same issue if the AI returns them as `{ value: "..." }` objects. Consider a systematic audit or a shared `extractStrField` helper used consistently for all plain-string fields.

## Test case
A unit test for `parseRecapAIResponse` should cover the case where `commission_currency` is returned as a ConfidenceField-shaped object from AI:
```ts
const raw = JSON.stringify({ commission_currency: { value: 'USD', confidence: 'confirmed' } });
const result = parseRecapAIResponse(raw, 'test-id');
expect(typeof result.commissionCurrency).toBe('string'); // 'USD', not [object Object]
expect(result.commissionCurrency).toBe('USD');
```
