/**
 * Tests for POST /api/agent/execute
 *
 * Tests session guard, planId mismatch validation, empty approvedStepIds,
 * and idempotency: same planId+approved set returns cached result.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

function makePlan(planId: string) {
  return {
    planId,
    goal: 'test goal',
    steps: [],
    estimated_actions: 0,
    createdAt: new Date().toISOString(),
  };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/agent/execute', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'sid' });
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/agent/execute/route');
    const planId = randomUUID();
    const res = await POST(makeReq({ planId, plan: makePlan(planId), approvedStepIds: [] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/agent/execute', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const { POST } = await import('@/app/api/agent/execute/route');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when planId does not match plan.planId', async () => {
    const { POST } = await import('@/app/api/agent/execute/route');
    const res = await POST(makeReq({
      planId: 'plan-A',
      plan: makePlan('plan-B'),
      approvedStepIds: [],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('planId_mismatch');
  });

  it('returns 200 with ExecutionResult for valid empty plan', async () => {
    const { POST } = await import('@/app/api/agent/execute/route');
    const planId = randomUUID();
    const res = await POST(makeReq({
      planId,
      plan: makePlan(planId),
      approvedStepIds: [],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.planId).toBe(planId);
    expect(Array.isArray(json.stepResults)).toBe(true);
    expect(typeof json.completedAt).toBe('string');
  });

  it('returns same cached result for identical planId + approvedStepIds (idempotency)', async () => {
    const { POST } = await import('@/app/api/agent/execute/route');
    const planId = randomUUID();
    const body = { planId, plan: makePlan(planId), approvedStepIds: [] };
    const res1 = await POST(makeReq(body));
    const res2 = await POST(makeReq(body));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const json1 = await res1.json();
    const json2 = await res2.json();
    expect(json1.completedAt).toBe(json2.completedAt);
  });
});
