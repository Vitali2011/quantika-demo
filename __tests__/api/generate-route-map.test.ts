/**
 * Tests for POST /api/ai/generate-route-map
 *
 * Feature flag guarded. Tests: flag off → 404, input validation (422),
 * rate limit enforcement (SQLite, real DB logic), and port name injection guard.
 */
import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/generate-route-map', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_BODY = {
  matchId: 'match-001',
  loading_port: 'Rotterdam',
  discharge_port: 'Singapore',
};

describe('POST /api/ai/generate-route-map', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, ROUTE_MAP_ENABLED: 'false' };
    testDb = new Database(':memory:');
    mockRequireSession.mockReset();
    mockRequireSession.mockReturnValue({
      sessionId: 'sess-123',
      session: {},
    });
  });

  afterEach(() => {
    testDb.close();
    process.env = origEnv;
  });

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('returns 401 when session is missing', async () => {
    process.env.ROUTE_MAP_ENABLED = 'true';
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 404 when feature flag is off', async () => {
    process.env.ROUTE_MAP_ENABLED = 'false';
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/disabled/i);
  });

  it('returns 422 for invalid port name (special chars)', async () => {
    process.env.ROUTE_MAP_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const res = await POST(makeReq({
      ...VALID_BODY,
      loading_port: '<script>alert(1)</script>',
    }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(Array.isArray(json.fields)).toBe(true);
  });

  it('returns 422 for port name that exceeds 50 chars', async () => {
    process.env.ROUTE_MAP_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const res = await POST(makeReq({
      ...VALID_BODY,
      loading_port: 'A'.repeat(51),
    }));
    expect(res.status).toBe(422);
  });

  it('returns 422 for missing required field loading_port', async () => {
    process.env.ROUTE_MAP_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/generate-route-map/route');
    const { loading_port: _, ...bodyWithoutPort } = VALID_BODY;
    const res = await POST(makeReq(bodyWithoutPort));
    expect(res.status).toBe(422);
  });

  it('checkRateLimit returns true (allow) when no prior entry in DB', async () => {
    const { checkRateLimit } = await import('@/app/api/ai/generate-route-map/route');
    expect(checkRateLimit('sess-x:match-new')).toBe(true);
  });

  it('checkRateLimit returns false (deny) after rate limit is recorded', async () => {
    const { checkRateLimit, recordRateLimit } = await import('@/app/api/ai/generate-route-map/route');
    const key = 'sess-y:match-rate';
    expect(checkRateLimit(key)).toBe(true);
    recordRateLimit(key);
    expect(checkRateLimit(key)).toBe(false);
  });

  it('buildRouteMapPrompt includes port names in output', async () => {
    const { buildRouteMapPrompt } = await import('@/app/api/ai/generate-route-map/route');
    const prompt = buildRouteMapPrompt({
      matchId: 'test',
      loading_port: 'Hamburg',
      discharge_port: 'Piraeus',
    });
    expect(prompt).toContain('Hamburg');
    expect(prompt).toContain('Piraeus');
  });
});
