# spec-betafix-10-auto-prequote-demo-wire

**Plan:** beta-fixes | **Batch:** 2 | **Severity:** HIGH
**Source bug:** BUG-15 (smoke report)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`scripts/auto-prequote-cron.ts` в demo run возвращает `{processedEmails:0, draftedQuotes:0}`. Нет `--demo` flag handling — pipeline читает из prod Gmail API (пусто на demo VPS).

## Files in scope

- `scripts/auto-prequote-cron.ts` (--demo flag + источник emails)
- `scripts/__tests__/auto-prequote-cron.test.ts` (или подобный path)

## Files FORBIDDEN

- `lib/auto-prequote/queue.ts` (BUG-βf-21 verify scope)
- `lib/sample-data/cargo-emails-v2/*` (read-only fixtures)

## Investigation

```bash
ls lib/sample-data/cargo-emails-v2/ 2>/dev/null | head
grep -n "processedEmails\|emailSource" scripts/auto-prequote-cron.ts
```

## TDD RED

```ts
import { runAutoPrequoteCron } from '../auto-prequote-cron';

it('--demo flag loads emails из sample-data/cargo-emails-v2', async () => {
  const result = await runAutoPrequoteCron({ demo: true });
  expect(result.processedEmails).toBeGreaterThan(0);
  expect(result.draftedQuotes).toBeGreaterThanOrEqual(0); // some могут не quote-able
});

it('without --demo — реальный Gmail flow (mocked or skipped)', async () => {
  // skip если нет gmail token; or mock
});

it('email errors не крешат cron', async () => {
  // existing behavior preserved
});
```

## Fix sketch

```ts
// scripts/auto-prequote-cron.ts
import { sampleCargoEmails } from '@/lib/sample-data/cargo-emails-v2';

async function getEmailsForRun(opts: { demo?: boolean }): Promise<Email[]> {
  if (opts.demo || process.env.AUTO_PREQUOTE_DEMO === '1') {
    return sampleCargoEmails; // или loadDemoEmails()
  }
  return await fetchGmailEmails(); // existing path
}
```

Также добавить `--demo` parsing если CLI использует `process.argv`:
```ts
const demoFlag = process.argv.includes('--demo') || process.env.AUTO_PREQUOTE_DEMO === '1';
```

## Acceptance criteria

- [ ] `--demo` → processedEmails > 0.
- [ ] Default (без --demo) — существующий поведение не сломано.
- [ ] Tests green.

## Commit

`fix(βf-10-auto-prequote-demo-wire): --demo loads sample cargo emails`
