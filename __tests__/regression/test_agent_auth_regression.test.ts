/**
 * Regression lock: /api/agent/plan and /api/agent/execute requireSession guards
 *
 * Both endpoints were unauthenticated prior to this fix. These tests lock:
 * - Unauthenticated POST to /api/agent/plan → 401 (not 500 or 200)
 * - Unauthenticated POST to /api/agent/execute → 401 (not 400 or 200)
 *
 * DO NOT mock lib/session — the whole point is to test real auth rejection.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getSession: (_id: string) => null,
    expireOldSessions: () => {},
  })),
}));

jest.mock('@/lib/agent/plan-first', () => ({
  buildPlan: jest.fn(),
  executePlan: jest.fn(),
}));

describe('REGRESSION: /api/agent/plan — auth guard', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns 401 when no session cookie', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const req = new NextRequest('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      body: JSON.stringify({ goal: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 401 when session_id cookie is invalid', async () => {
    const { POST } = await import('@/app/api/agent/plan/route');
    const req = new NextRequest('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      body: JSON.stringify({ goal: 'test' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session_id=deadbeef00000000ffffffffffffffff',
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});

describe('REGRESSION: /api/agent/execute — auth guard', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns 401 when no session cookie', async () => {
    const { POST } = await import('@/app/api/agent/execute/route');
    const req = new NextRequest('http://localhost:3000/api/agent/execute', {
      method: 'POST',
      body: JSON.stringify({
        planId: 'p1',
        plan: {
          planId: 'p1',
          goal: 'test',
          steps: [],
          estimated_actions: 0,
          createdAt: new Date().toISOString(),
        },
        approvedStepIds: [],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 401 when session_id cookie is invalid', async () => {
    const { POST } = await import('@/app/api/agent/execute/route');
    const req = new NextRequest('http://localhost:3000/api/agent/execute', {
      method: 'POST',
      body: JSON.stringify({
        planId: 'p1',
        plan: {
          planId: 'p1',
          goal: 'test',
          steps: [],
          estimated_actions: 0,
          createdAt: new Date().toISOString(),
        },
        approvedStepIds: [],
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session_id=deadbeef00000000ffffffffffffffff',
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});
