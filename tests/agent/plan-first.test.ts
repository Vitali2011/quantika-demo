/**
 * β-11: plan-first core unit tests.
 *
 * Covers buildPlan + executePlan (approval gating, kinds, structure).
 * Idempotency tested separately в execute-idempotency.test.ts.
 *
 * Assert-budget: ≤ 30 expects (pipeline guard) — group via snapshot objects.
 */

import {
  buildPlan,
  executePlan,
  resetStepHandlers,
  setStepHandler,
} from '@/lib/agent/plan-first';
import { _resetIdempotencyCache } from '@/lib/agent/idempotency';
import { PLAN_STEP_KINDS, type PlanStepKind } from '@/lib/agent/plan-types';

describe('β-11 buildPlan', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('decomposes a prequote+sanctions goal into structured Plan', async () => {
    const plan = await buildPlan('Send prequote email to charterer X and check sanctions', {
      counterpartyId: 'X',
    });
    const stepKinds = plan.steps.map((s) => s.kind);
    const snapshot = {
      hasPlanId: typeof plan.planId === 'string' && plan.planId.length > 0,
      goalEcho: plan.goal,
      stepCountPositive: plan.steps.length > 0,
      kindsAllValid: stepKinds.every((k) =>
        (PLAN_STEP_KINDS as readonly string[]).includes(k),
      ),
      includesSanctions: stepKinds.includes('check-sanctions'),
      includesEmailOrQuote:
        stepKinds.includes('send-email') || stepKinds.includes('generate-quote'),
      estimatedActionsMatchesSideEffects:
        plan.estimated_actions ===
        plan.steps.filter((s) =>
          ['send-email', 'send-whatsapp', 'generate-quote'].includes(s.kind),
        ).length,
      createdAtIsIso: !Number.isNaN(Date.parse(plan.createdAt)),
      sideEffectStepsRequireApproval: plan.steps
        .filter((s) =>
          ['send-email', 'send-whatsapp', 'generate-quote'].includes(s.kind),
        )
        .every((s) => s.requires_approval === true),
    };
    expect(snapshot).toEqual({
      hasPlanId: true,
      goalEcho: 'Send prequote email to charterer X and check sanctions',
      stepCountPositive: true,
      kindsAllValid: true,
      includesSanctions: true,
      includesEmailOrQuote: true,
      estimatedActionsMatchesSideEffects: true,
      createdAtIsIso: true,
      sideEffectStepsRequireApproval: true,
    });
  });

  it('falls back to noop when goal has no recognizable keywords', async () => {
    const plan = await buildPlan('think about the universe', {});
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].kind).toBe('noop');
    expect(plan.estimated_actions).toBe(0);
  });

  it('rejects empty goal', async () => {
    await expect(buildPlan('', {})).rejects.toThrow(/non-empty/);
  });
});

describe('β-11 executePlan', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('skips all steps when no approvals provided', async () => {
    const plan = await buildPlan('Send email and check CII', {});
    const result = await executePlan(plan, []);
    const statuses = result.stepResults.map((r) => r.status);
    expect(result.planId).toBe(plan.planId);
    expect(statuses.every((s) => s === 'skipped')).toBe(true);
    expect(result.stepResults).toHaveLength(plan.steps.length);
  });

  it('executes only approved steps, others skipped', async () => {
    let emailCalls = 0;
    setStepHandler('send-email', () => {
      emailCalls += 1;
      return { sent: true };
    });
    const plan = await buildPlan('Send email to charterer and compare-routes Suez', {});
    const emailStep = plan.steps.find((s) => s.kind === 'send-email');
    expect(emailStep).toBeDefined();
    const result = await executePlan(plan, [emailStep!.id]);
    const byId = Object.fromEntries(
      result.stepResults.map((r) => [r.stepId, r.status]),
    );
    const expectedById = Object.fromEntries(
      plan.steps.map((s) => [s.id, s.id === emailStep!.id ? 'success' : 'skipped']),
    );
    expect(byId).toEqual(expectedById);
    expect(emailCalls).toBe(1);
  });

  it('throws on unknown approved step id', async () => {
    const plan = await buildPlan('Send email', {});
    await expect(executePlan(plan, ['not-in-plan'])).rejects.toThrow(/not in plan/);
  });

  it('captures handler errors as failed status', async () => {
    setStepHandler('send-email', () => {
      throw new Error('SMTP down');
    });
    const plan = await buildPlan('Send email to test', {});
    const emailStep = plan.steps.find((s) => s.kind === 'send-email')!;
    const result = await executePlan(plan, [emailStep.id]);
    const failed = result.stepResults.find((r) => r.stepId === emailStep.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/SMTP down/);
  });
});

describe('β-11 PlanStepKind enum', () => {
  it('exposes exactly the documented kinds', () => {
    const expected: PlanStepKind[] = [
      'send-email',
      'send-whatsapp',
      'generate-quote',
      'compare-routes',
      'check-sanctions',
      'check-cii',
      'check-l5c',
      'noop',
    ];
    expect([...PLAN_STEP_KINDS].sort()).toEqual([...expected].sort());
  });
});
