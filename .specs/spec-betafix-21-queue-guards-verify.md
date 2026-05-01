# spec-betafix-21-queue-guards-verify

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH (combined verify-and-skip)
**Source bugs:** BUG-β-15-IdempotencyReplay, BUG-β-15-EnqueueValidation (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug (claimed)

1. `lib/auto-prequote/queue.ts:98-113` — `approveDraft`/`rejectDraft` ignore current status: rejected → approved replay possible.
2. `lib/auto-prequote/queue.ts:79-88` — `enqueueDraft` accepts NaN/negative/empty values.

## VERIFY-FIRST status

Pre-investigation Opus orchestrator'ом показал **уже присутствующие guards**:
- `enqueueDraft` (строки 79-93): throws на empty emailId, empty vessel, empty summary, NaN/negative freightUsd.
- `approveDraft` (строки 117-122): throws когда `d.status !== 'awaiting_approval'`.

**Задача impl-агента:** verify-first via tests, добавить test coverage если её нет. Если guards действительно адекватны — RESULT block status = `SKIPPED-VERIFIED` без commit; иначе fill gaps.

## Files in scope

- `lib/auto-prequote/queue.ts` (только если gaps обнаружены)
- `lib/auto-prequote/__tests__/queue.test.ts` (test coverage — это тоже legitimate work даже если no code changes)

## Files FORBIDDEN

- Любые другие `lib/auto-prequote/*` (отдельные специ или OOS).

## TDD RED — comprehensive coverage

```ts
import { enqueueDraft, approveDraft, rejectDraft, _resetQueueForTests } from '../queue';

beforeEach(() => _resetQueueForTests?.());

describe('enqueueDraft validation', () => {
  it('empty emailId → throws', () => {
    expect(() => enqueueDraft({ emailId: '', vessel: 'V', freightUsd: 1000, summary: 's' })).toThrow(/emailId/);
  });
  it('empty vessel → throws', () => {
    expect(() => enqueueDraft({ emailId: 'e', vessel: '', freightUsd: 1000, summary: 's' })).toThrow(/vessel/);
  });
  it('empty summary → throws', () => {
    expect(() => enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: 1000, summary: '' })).toThrow(/summary/);
  });
  it('NaN freightUsd → throws', () => {
    expect(() => enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: NaN, summary: 's' })).toThrow(/freightUsd/);
  });
  it('negative freightUsd → throws', () => {
    expect(() => enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: -5, summary: 's' })).toThrow(/freightUsd/);
  });
  it('Infinity freightUsd → throws', () => {
    expect(() => enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: Infinity, summary: 's' })).toThrow(/freightUsd/);
  });
  it('valid → returns draft с id and status awaiting_approval', () => {
    const d = enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: 100_000, summary: 's' });
    expect(d.id).toBeTruthy();
    expect(d.status).toBe('awaiting_approval');
  });
});

describe('approve/reject state machine', () => {
  it('rejected → approveDraft throws', () => {
    const d = enqueueDraft({ emailId: 'e1', vessel: 'V', freightUsd: 1000, summary: 's' });
    rejectDraft(d.id, 'too low');
    expect(() => approveDraft(d.id)).toThrow(/cannot transition/);
  });
  it('approved → rejectDraft throws (no double-action)', () => {
    const d = enqueueDraft({ emailId: 'e2', vessel: 'V', freightUsd: 1000, summary: 's' });
    approveDraft(d.id);
    expect(() => rejectDraft(d.id, 'reason')).toThrow();
  });
  it('approved → approveDraft (re-approve) — throws or no-op? assert no-op or throws consistently', () => {
    const d = enqueueDraft({ emailId: 'e3', vessel: 'V', freightUsd: 1000, summary: 's' });
    approveDraft(d.id);
    expect(() => approveDraft(d.id)).toThrow(); // assuming current impl throws
  });
  it('unknown id → throws "not found"', () => {
    expect(() => approveDraft('nonexistent')).toThrow(/not found/);
  });
});
```

## Fix sketch

**Если existing guards проходят все tests:**
RESULT status = `SKIPPED-VERIFIED`. Commit только новый test file (это polish/coverage, не fix).
Commit: `test(βf-21-queue-guards-verify): add comprehensive boundary coverage (no impl changes — guards already present)`

**Если gaps обнаружены** (например `Infinity` not handled):
```ts
if (!Number.isFinite(input.freightUsd) || input.freightUsd < 0) {
  throw new Error(`enqueueDraft: freightUsd must be a non-negative finite number, got ${input.freightUsd}`);
}
```

## Acceptance criteria

- [ ] Все RED тесты проходят.
- [ ] RESULT block честно отражает: SKIPPED-VERIFIED (если no impl changes) или DONE (если gaps fixed).
- [ ] Test coverage для всех 6 boundary classes (empty, NaN, negative, Infinity, state-transition, unknown-id).

## Commit

`test(βf-21-queue-guards-verify): comprehensive boundary tests (impl already present per pre-check)` 

или (если gaps):
`fix(βf-21-queue-guards-verify): add Infinity check для enqueueDraft.freightUsd`
