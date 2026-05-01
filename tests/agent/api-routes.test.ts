/**
 * β-11: API routes integration tests.
 *
 * Validates POST /api/agent/plan и POST /api/agent/execute.
 * Tests Plan→Execute flow + idempotency at HTTP layer.
 *
 * Assert-budget: ≤ 30 expects.
 */

import { POST as planPOST } from '@/app/api/agent/plan/route';
import { POST as execPOST } from '@/app/api/agent/execute/route';
import { _resetIdempotencyCache } from '@/lib/agent/idempotency';
import { resetStepHandlers, setStepHandler } from '@/lib/agent/plan-first';

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/agent/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('β-11 API: /api/agent/plan', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('returns Plan JSON for valid goal', async () => {
    const res = await planPOST(
      jsonReq({ goal: 'Send prequote email to charterer X', context: {} }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect({
      hasPlanId: typeof body.planId === 'string',
      hasSteps: Array.isArray(body.steps) && body.steps.length > 0,
      goalEcho: body.goal,
    }).toEqual({
      hasPlanId: true,
      hasSteps: true,
      goalEcho: 'Send prequote email to charterer X',
    });
  });

  it('rejects empty goal with 400', async () => {
    const res = await planPOST(jsonReq({ goal: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const req = new Request('http://localhost/api/agent/plan', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await planPOST(req);
    expect(res.status).toBe(400);
  });
});

describe('β-11 API: /api/agent/execute', () => {
  beforeEach(() => {
    _resetIdempotencyCache();
    resetStepHandlers();
  });

  it('executes approved steps and is idempotent on re-POST', async () => {
    let calls = 0;
    setStepHandler('send-email', () => {
      calls += 1;
      return { ok: true };
    });
    const planRes = await planPOST(
      jsonReq({ goal: 'Send email to charterer X', context: {} }),
    );
    const plan = await planRes.json();
    const emailStep = plan.steps.find(
      (s: { kind: string }) => s.kind === 'send-email',
    );

    const r1 = await execPOST(
      jsonReq({ planId: plan.planId, plan, approvedStepIds: [emailStep.id] }),
    );
    const body1 = await r1.json();

    const r2 = await execPOST(
      jsonReq({ planId: plan.planId, plan, approvedStepIds: [emailStep.id] }),
    );
    const body2 = await r2.json();

    expect({
      r1status: r1.status,
      r2status: r2.status,
      sideEffectsOnce: calls,
      sameCompletedAt: body1.completedAt === body2.completedAt,
      stepSuccess: body1.stepResults.find(
        (s: { stepId: string }) => s.stepId === emailStep.id,
      )?.status,
    }).toEqual({
      r1status: 200,
      r2status: 200,
      sideEffectsOnce: 1,
      sameCompletedAt: true,
      stepSuccess: 'success',
    });
  });

  it('rejects planId mismatch', async () => {
    const planRes = await planPOST(jsonReq({ goal: 'Send email', context: {} }));
    const plan = await planRes.json();
    const res = await execPOST(
      jsonReq({ planId: 'other-id', plan, approvedStepIds: [] }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown step id', async () => {
    const planRes = await planPOST(jsonReq({ goal: 'Send email', context: {} }));
    const plan = await planRes.json();
    const res = await execPOST(
      jsonReq({
        planId: plan.planId,
        plan,
        approvedStepIds: ['ghost-step-id'],
      }),
    );
    expect(res.status).toBe(400);
  });
});
