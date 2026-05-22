/**
 * Tests for POST /api/agent/plan
 *
 * Validates session guard, goal validation, and plan shape from
 * the deterministic rule-based planner (AGENT_PLANNER_PROVIDER=regex).
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/plan', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/agent/plan', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, AGENT_PLANNER_PROVIDER: 'regex' };
    mockRequireSession.mockReset();
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'sid' });
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(makeReq({ goal: 'send email' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/agent/plan', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty goal string', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(makeReq({ goal: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when goal field is missing', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(makeReq({ context: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with plan containing planId, goal, steps array', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(makeReq({ goal: 'send shipping quote' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.planId).toBe('string');
    expect(json.goal).toBe('send shipping quote');
    expect(Array.isArray(json.steps)).toBe(true);
    expect(typeof json.estimated_actions).toBe('number');
    expect(typeof json.createdAt).toBe('string');
  });

  it('plan steps each have required fields (id, kind, description)', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const res = await POST(makeReq({ goal: 'check sanctions and send quote' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    for (const step of json.steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.kind).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(typeof step.requires_approval).toBe('boolean');
    }
  });
});
