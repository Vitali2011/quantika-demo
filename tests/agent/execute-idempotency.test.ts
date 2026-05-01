/**
 * β-11: executePlan idempotency.
 *
 * Re-POST с тем же planId → cached ExecutionResult, side-effects не повторяются.
 *
 * Assert-budget: ≤ 30 expects.
 */

import {
  buildPlan,
  executePlan,
  resetStepHandlers,
  setStepHandler,
} from '@/lib/agent/plan-first';
import {
  _resetIdempotencyCache,
  cacheExecution,
  getCachedExecution,
} from '@/lib/agent/idempotency';

describe('β-11 idempotency', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('does not re-invoke handlers on repeated executePlan call', async () => {
    let calls = 0;
    setStepHandler('send-email', () => {
      calls += 1;
      return { messageId: `m${calls}` };
    });
    const plan = await buildPlan('Send email to charterer', {});
    const emailStep = plan.steps.find((s) => s.kind === 'send-email')!;

    const r1 = await executePlan(plan, [emailStep.id]);
    const r2 = await executePlan(plan, [emailStep.id]);
    const r3 = await executePlan(plan, [emailStep.id]);

    const snapshot = {
      sameResult: r1 === r2 && r2 === r3,
      planIdStable: r1.planId === plan.planId && r2.planId === plan.planId,
      sideEffectCallsExactlyOnce: calls === 1,
      stepStatusSuccess: r1.stepResults.find((s) => s.stepId === emailStep.id)?.status,
      cachedRetrievable: getCachedExecution(plan.planId) !== null,
    };
    expect(snapshot).toEqual({
      sameResult: true,
      planIdStable: true,
      sideEffectCallsExactlyOnce: true,
      stepStatusSuccess: 'success',
      cachedRetrievable: true,
    });
  });

  it('cache TTL expiry forgets entries', async () => {
    const plan = await buildPlan('noop goal here', {});
    cacheExecution(
      plan.planId,
      { planId: plan.planId, stepResults: [], completedAt: new Date().toISOString() },
      -1,
    );
    expect(getCachedExecution(plan.planId)).toBeNull();
  });

  it('different planIds → independent cache entries', async () => {
    let calls = 0;
    setStepHandler('send-email', () => {
      calls += 1;
      return { ok: true };
    });
    const planA = await buildPlan('Send email A', {});
    const planB = await buildPlan('Send email B', {});
    const stepA = planA.steps.find((s) => s.kind === 'send-email')!;
    const stepB = planB.steps.find((s) => s.kind === 'send-email')!;
    await executePlan(planA, [stepA.id]);
    await executePlan(planB, [stepB.id]);
    await executePlan(planA, [stepA.id]); // cached
    await executePlan(planB, [stepB.id]); // cached
    expect(calls).toBe(2);
  });
});
