# spec-betafix-11-parse-cargo-timeout

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** HIGH
**Source bug:** H1 (browser report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`POST /api/ai/parse-cargo` → 524 Cloudflare timeout (>100s). UI зависает на "Reading your cargo inquiries..." 50% ~40s. Real inbox с 30+ emails fail silently.

Root causes (likely):
- Не задан `maxDuration` на route (Next.js 16 defaults Vercel/serverless 60s; локально дольше)
- Prompt size — full email body слишком большой
- LLM cliproxy slow

## Files in scope

- `app/api/ai/parse-cargo/route.ts` (timeout + chunking)
- `app/api/ai/parse-cargo/__tests__/route.test.ts`
- (опционально) `lib/prompts/cargo-parse.ts` — prompt trim

## Files FORBIDDEN

- Other AI routes (другие специ).

## Investigation

```bash
grep -n "maxDuration\|export const" app/api/ai/parse-cargo/route.ts
grep -n "body\.slice\|body.substring\|truncate" lib/prompts/*.ts
```

## TDD RED + integration

```ts
it('parse-cargo route exports maxDuration <= 60', () => {
  const mod = require('../route');
  expect(mod.maxDuration).toBeLessThanOrEqual(60);
});

it('large email body (>50k chars) — truncated в prompt', async () => {
  // ensure prompt builder обрезает email body до safe size (~10-15k chars)
  const huge = 'A'.repeat(60_000);
  const truncated = buildCargoParsePrompt({ body: huge });
  expect(truncated.length).toBeLessThan(20_000);
});

it('timeout fallback — quick-extract не AI fails', async () => {
  // если LLM возвращает 524/timeout, route должен вернуть partial parse через regex fallback с confidence:'low'
});
```

## Fix sketch

```ts
// app/api/ai/parse-cargo/route.ts
export const maxDuration = 55; // <60s Cloudflare cap

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Truncate email body before sending to LLM
  const trimmedBody = body.emailBody.length > 12_000
    ? body.emailBody.slice(0, 12_000) + '\n[truncated]'
    : body.emailBody;
  
  // Race: LLM call vs 50s timeout
  const result = await Promise.race([
    callAiJson(prompt, /* … */),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50_000))
  ]).catch(err => {
    // Fallback to regex-based quick-extract
    return regexQuickExtract(trimmedBody, { confidence: 'low' });
  });
  
  return NextResponse.json(result);
}
```

## Acceptance criteria

- [ ] `maxDuration <= 55`.
- [ ] Email body > 50k chars trimmed до ≤ 12k в prompt.
- [ ] LLM timeout → graceful fallback (не 524, а 200 с lower confidence).
- [ ] Existing tests green.

## Commit

`fix(βf-11-parse-cargo-timeout): maxDuration=55s + body trim + regex fallback`
