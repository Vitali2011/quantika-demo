# spec-betafix-17-empty-rawtext-guard

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH
**Source bug:** BUG-β-stab-03-EmptyRawText (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`lib/whatsapp/forward-parser.ts:146-153` — после switch (image/audio/PDF) код вызывает `callAiJson(rawText, …)` даже если rawText=''. Spec stab-03 explicitly требует guard ДО AI call. Wastes OpenAI quota.

## Files in scope

- `lib/whatsapp/forward-parser.ts` (insert guard)
- `lib/whatsapp/__tests__/forward-parser.test.ts`

## Files FORBIDDEN

- `lib/whatsapp/signature.ts` (HMAC, отдельный)
- Other lib/whatsapp/* files

## TDD RED

```ts
import { parseForwardedMessage } from '../forward-parser';

it('empty rawText → uncertain БЕЗ AI call', async () => {
  const aiSpy = jest.fn();
  jest.mock('@/lib/openai', () => ({ callAiJson: aiSpy }));
  
  const result = await parseForwardedMessage({ type: 'image', payload: '<illegible>' });
  expect(result.confidence).toBe('uncertain');
  expect(result.missingFields).toContain('empty rawText');
  expect(aiSpy).not.toHaveBeenCalled();
});

it('whitespace-only rawText → uncertain', async () => {
  const result = await parseForwardedMessage({ type: 'audio', /* triggers transcription returning "   " */ });
  expect(result.confidence).toBe('uncertain');
});

it('valid rawText → AI called', async () => {
  // existing happy path
});
```

## Fix sketch

```ts
// lib/whatsapp/forward-parser.ts after switch:
// existing:
//   switch (type) { case 'image': rawText = await ocr(payload); ... }

if (!rawText || rawText.trim() === '') {
  return {
    confidence: 'uncertain',
    missingFields: ['empty rawText'],
    rawText: '',
  };
}

let rawOrNull: RawParseResponse | null = await callAiJson('', SYSTEM_PROMPT, ...);
```

## Acceptance criteria

- [ ] Empty/whitespace rawText → uncertain без AI call.
- [ ] Valid rawText → existing flow.
- [ ] Existing tests green.
- [ ] Mock callAiJson not called в empty case.

## Commit

`fix(βf-17-empty-rawtext-guard): skip AI call для empty rawText (stab-03 spec compliance)`
