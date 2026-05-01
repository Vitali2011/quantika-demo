# spec-betafix-20-passport-nan-guards

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH
**Source bug:** BUG-β-13-PassportNaN (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`extensions/gmail/inserts/passport.ts:54,65` — `.toLocaleString()` вызывается на numbers без finite-check. API `{dwt:undefined}` → `undefined.toLocaleString()` TypeError. `NaN.toLocaleString()` → `'NaN'` shown в compose.

## Files in scope

- `extensions/gmail/inserts/passport.ts` (toLocaleString sites — lines 54, 65, и любые другие)
- `extensions/gmail/__tests__/passport.test.ts`

## Files FORBIDDEN

- `extensions/gmail/inserts/index.ts`, `bimco.ts`, `economics.ts`, `sanitize.ts` — spec-βf-15 territory. **Coordinate**: spec-15 уже modify `esc()` helper в общем месте; spec-20 здесь только на toLocaleString call sites.
- `extensions/gmail/inserts/passport.ts` `esc()` строка — territory spec-15.

## TDD RED

```ts
import { buildPassportInsert } from '../passport';

it('dwt:undefined → "n/a", не TypeError', () => {
  const html = buildPassportInsert({ name: 'V', imo: '123', dwt: undefined as any });
  expect(html).toContain('n/a');
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('undefined');
});

it('rate:null в fixture → "n/a"', () => {
  const html = buildPassportInsert({
    name: 'V', imo: '123',
    fixtures: [{ rate: null as any, route: 'X→Y' }],
  });
  expect(html).toContain('n/a');
});

it('NaN → "n/a"', () => {
  const html = buildPassportInsert({ name: 'V', imo: '123', dwt: NaN });
  expect(html).toContain('n/a');
});

it('valid 30000 → "30,000"', () => {
  const html = buildPassportInsert({ name: 'V', imo: '123', dwt: 30000 });
  expect(html).toContain('30,000');
});
```

## Fix sketch

```ts
// extensions/gmail/inserts/passport.ts
function fmtNum(n: unknown, locale = 'en-US'): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString(locale) : 'n/a';
}

// Replace all `.toLocaleString()` calls:
// Before: ${vessel.dwt.toLocaleString()}
// After:  ${fmtNum(vessel.dwt)}
//
// Before: ${f.rate.toLocaleString()}
// After:  ${fmtNum(f.rate)}
```

## Acceptance criteria

- [ ] `undefined`/`null`/`NaN` → "n/a".
- [ ] Valid number → formatted "30,000".
- [ ] No TypeError на boundary inputs.
- [ ] Existing passport tests green.

## Commit

`fix(βf-20-passport-nan-guards): fmtNum helper для safe number formatting`
