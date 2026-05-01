# spec-betafix-12-vessel-cii-parse

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** HIGH
**Source bug:** H4 (browser report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

sample-20 (MV CARBON LADY) — subject line: "MV CARBON LADY — CII Grade D — open Lagos prompt" — но vessel page показывает "No vessel data parsed from this email." LLM classifier accept'ил, но parser не вернул structured data.

## Files in scope

- `lib/prompts/vessel-parse.ts` или `vessel-parser-prompt.ts` (improve prompt)
- `app/api/ai/parse-vessel/route.ts` (post-process для CII rating extract из subject)
- `app/api/ai/parse-vessel/__tests__/route.test.ts`

## Files FORBIDDEN

- Other parsers (cargo, recap).

## Investigation

```bash
grep -n "vessel" lib/prompts/*.ts | head
ls app/api/ai/ | grep -i vessel
```

## TDD RED

```ts
it('CARBON LADY (subject "MV CARBON LADY — CII Grade D") → vessel.name + cii_rating extracted', async () => {
  const email = {
    subject: 'MV CARBON LADY — CII Grade D — open Lagos prompt',
    body: 'Dear Sir/Madam, MV CARBON LADY 32k DWT MPP open Lagos…',
  };
  const result = await parseVessel(email);
  expect(result.name).toMatch(/CARBON LADY/i);
  expect(result.cii_rating).toBe('D');
  expect(result.dwt).toBe(32_000);
});

it('Subject-only CII Grade extraction (no body match) — still extracted', async () => {
  const email = {
    subject: 'MV TEST VESSEL — CII Grade B — looking for next',
    body: 'short greeting',
  };
  const result = await parseVessel(email);
  expect(result.cii_rating).toBe('B');
});

it('No CII в email — cii_rating:null, не "unknown" string', async () => {
  // graceful default
});
```

## Fix sketch

1. **Prompt update** в `vessel-parse.ts`:
   ```
   You will be given subject + body. Extract vessel data.
   IMPORTANT: CII rating (A-E) may appear in subject line как "CII Grade X" or "CII X" or "Grade X". 
   Always check subject for CII даже если body doesn't mention it.
   Return cii_rating: "A"|"B"|"C"|"D"|"E"|null.
   ```

2. **Post-process regex backup** в route handler:
   ```ts
   const ciiMatch = (email.subject ?? '').match(/CII\s*(?:Grade\s*)?([A-E])\b/i);
   if (ciiMatch && !result.cii_rating) {
     result.cii_rating = ciiMatch[1].toUpperCase();
   }
   ```

3. Если LLM возвращает "no parse" но есть какие-то signals в subject (vessel name pattern `MV/MT/SV [A-Z\s]+`) — не возвращать пустой response, а partial с confidence:'low'.

## Acceptance criteria

- [ ] CARBON LADY email → name + cii_rating='D'.
- [ ] Subject-only CII → extracted.
- [ ] No CII в email → null (не "unknown").
- [ ] Existing parse-vessel tests green.

## Commit

`fix(βf-12-vessel-cii-parse): extract CII rating from subject + prompt update`
