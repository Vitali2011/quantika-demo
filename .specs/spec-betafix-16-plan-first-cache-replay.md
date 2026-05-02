# spec-betafix-16-plan-first-cache-replay

**Plan:** beta-fixes | **Batch:** 4 | **Severity:** HIGH
**Source bug:** BUG-β-11-PlanCacheReplay (adversarial)
**Read first:** `.specs/SHARED_CONTEXT-beta-fixes.md`

## Bug

`lib/agent/plan-first.ts:149-150` — `executePlan` возвращает stale cached execution независимо от newly-approved steps. User approves только check-sanctions → cache. Later approves +send-email → возвращается тот же cached result, email never sent (silent denial). Defeats Plan-First safety mechanism.

## Files in scope

- `lib/agent/plan-first.ts` (cache key + invalidation)
- `lib/agent/__tests__/plan-first.test.ts`

## Files FORBIDDEN

- Other `lib/agent/*` files unless directly cache-related.

## TDD RED

```ts
import { buildPlan, executePlan, _resetPlanFirstForTests } from '../plan-first';

beforeEach(() => _resetPlanFirstForTests?.());

it('expanded approvedSet — cache invalidated, side effects run', async () => {
  const plan = await buildPlan('check sanctions then send email');
  const sanctionStepId = plan.steps.find(s => s.kind === 'check-sanctions')!.id;
  const emailStepId = plan.steps.find(s => s.kind === 'send-email')!.id;
  
  const result1 = await executePlan(plan, [sanctionStepId]);
  expect(result1.executedStepIds).toEqual([sanctionStepId]);
  
  const result2 = await executePlan(plan, [sanctionStepId, emailStepId]);
  // email step должен быть EXECUTED, не cached-skipped
  expect(result2.executedStepIds).toContain(emailStepId);
});

it('same approvedSet retried — idempotent (cache hit OK для side-effect-free steps)', async () => {
  // если кеш сохраняем — проверить что hit для identical input
});

it('shrunk approvedSet (subset) — re-execute с subset', async () => {
  // edge case: approvedSet смягчается, не cached prior superset
});
```

## Fix sketch

Option A (recommended): cache key включает hash of approvedStepIds.
```ts
function cacheKey(plan: Plan, approvedStepIds: string[]): string {
  const sorted = [...approvedStepIds].sort();
  return `${plan.id}:${sorted.join(',')}`;
}

const cached = getCachedExecution(cacheKey(plan, approvedStepIds));
if (cached) return cached;
```

Option B: drop plan-level cache, move idempotency to per-step (each step checks its own done-marker).

Option A проще и менее invasive. Choose unless tests reveal complications.

## Acceptance criteria

- [ ] Expanded approvedSet → side effects новых steps выполняются.
- [ ] Identical input — cache hit OK (idempotent).
- [ ] Shrunk approvedSet → re-execute (treated as different request).
- [ ] No new race-condition введён.
- [ ] Tests green.

## Commit

`fix(βf-16-plan-first-cache-replay): cache key включает hash approvedStepIds`
