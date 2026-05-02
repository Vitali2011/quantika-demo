/**
 * BUG-β-11-PlanCacheReplay — executePlan must invalidate (or namespace) the
 * plan-level cache when approvedStepIds changes.
 *
 * Scenario: user first approves only a subset of steps; later expands the
 * approved set. The second executePlan call must run the newly-approved
 * step's side effect — not return the old cached result.
 */

import {
  buildPlan,
  executePlan,
  resetStepHandlers,
  setStepHandler,
} from '@/lib/agent/plan-first';
import { _resetIdempotencyCache } from '@/lib/agent/idempotency';

describe('BUG-β-11-PlanCacheReplay', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('runs newly-approved side-effect step on second execution', async () => {
    let emailCalls = 0;
    let sanctionsCalls = 0;
    setStepHandler('send-email', () => {
      emailCalls += 1;
      return { messageId: `m${emailCalls}` };
    });
    setStepHandler('check-sanctions', () => {
      sanctionsCalls += 1;
      return { ok: true };
    });

    const plan = await buildPlan('send email and check sanctions');
    const emailStep = plan.steps.find((s) => s.kind === 'send-email')!;
    const sanctionsStep = plan.steps.find((s) => s.kind === 'check-sanctions')!;

    // First call: approve only sanctions.
    await executePlan(plan, [sanctionsStep.id]);
    expect(sanctionsCalls).toBe(1);
    expect(emailCalls).toBe(0);

    // Second call: expand approved set with email step.
    const r2 = await executePlan(plan, [sanctionsStep.id, emailStep.id]);
    // BUG-β-11: previously returned stale result; email never ran.
    expect(emailCalls).toBe(1);
    const emailResult = r2.stepResults.find((s) => s.stepId === emailStep.id);
    expect(emailResult?.status).toBe('success');
  });

  it('identical approvedSet retried — cache hit, no duplicate side effects', async () => {
    let emailCalls = 0;
    setStepHandler('send-email', () => {
      emailCalls += 1;
      return { messageId: `m${emailCalls}` };
    });

    const plan = await buildPlan('send email and check sanctions');
    const emailStep = plan.steps.find((s) => s.kind === 'send-email')!;
    const sanctionsStep = plan.steps.find((s) => s.kind === 'check-sanctions')!;

    const approved = [sanctionsStep.id, emailStep.id];
    const r1 = await executePlan(plan, approved);
    // Re-call with identical (but reordered) input — must cache-hit and not
    // re-run the email side effect.
    const r2 = await executePlan(plan, [emailStep.id, sanctionsStep.id]);

    expect(emailCalls).toBe(1);
    expect(r2.completedAt).toBe(r1.completedAt); // same cached object
  });

  it('shrunk approvedSet (subset of prior) — re-execute with subset', async () => {
    let emailCalls = 0;
    let sanctionsCalls = 0;
    setStepHandler('send-email', () => {
      emailCalls += 1;
      return { messageId: `m${emailCalls}` };
    });
    setStepHandler('check-sanctions', () => {
      sanctionsCalls += 1;
      return { ok: true };
    });

    const plan = await buildPlan('send email and check sanctions');
    const emailStep = plan.steps.find((s) => s.kind === 'send-email')!;
    const sanctionsStep = plan.steps.find((s) => s.kind === 'check-sanctions')!;

    // First: approve both.
    await executePlan(plan, [sanctionsStep.id, emailStep.id]);
    expect(emailCalls).toBe(1);
    expect(sanctionsCalls).toBe(1);

    // Second: shrink to only sanctions — must NOT return stale superset cache.
    const r2 = await executePlan(plan, [sanctionsStep.id]);
    const emailResult = r2.stepResults.find((s) => s.stepId === emailStep.id);
    // Email step must be marked skipped in new result, not 'success' from
    // the cached prior superset run.
    expect(emailResult?.status).toBe('skipped');
    // Email handler must not have been called a second time (per-step cache
    // covers idempotency for send-email).
    expect(emailCalls).toBe(1);
  });
});
