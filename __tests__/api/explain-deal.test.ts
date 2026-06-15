/**
 * Tests for POST /api/ai/explain-deal
 *
 * Feature flag EXPLAIN_DEAL_ENABLED. Tests: flag off → 403,
 * missing session → 401, invalid body → 400, match not found → 404.
 * The LLM call is mocked so tests stay hermetic.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(async () =>
    'Market Context\nSolid demand.\nDeal Rationale\nGood fit.\nKey Risks\nNone.\nRecommended Next Steps\nProceed.',
  ),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

const MOCK_SESSION = {
  matches: [
    {
      cargoEmailId: 'e1',
      cargoItemIndex: 0,
      vesselEmailId: 'v1',
      vesselItemIndex: 0,
      score: 85,
      matchLevel: 'good',
      matchReasons: ['size ok'],
      issues: [],
      economics: null,
      scoreBreakdown: null,
    },
  ],
  parsedCargos: [],
  parsedVessels: [],
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/explain-deal', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/ai/explain-deal', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, EXPLAIN_DEAL_ENABLED: 'false' };
    mockRequireSession.mockReset();
    mockRequireSession.mockReturnValue({ session: MOCK_SESSION, sessionId: 'sid' });
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns 403 (feature_disabled) when flag is off', async () => {
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('feature_disabled');
  });

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid request body (missing matchIndex)', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ language: 'en' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid language value', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'fr' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when matchIndex out of range', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 99, language: 'en' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Match not found');
  });

  it('returns 200 with 4-section narrative when flag is enabled and match exists', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.language).toBe('en');
    expect(Array.isArray(json.sections)).toBe(true);
    expect(json.sections).toHaveLength(4);
    expect(json.sections[0].heading).toBe('Market Context');
    expect(typeof json.sections[0].content).toBe('string');
  });

  // #1001 — demo mode must bypass feature flag gate
  it('returns 200 with demo narrative in demo mode even when flag is off', async () => {
    process.env.DEMO_MODE = 'true';
    // EXPLAIN_DEAL_ENABLED remains 'false' (set in beforeEach)
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe('demo');
    expect(Array.isArray(json.sections)).toBe(true);
    expect(json.sections).toHaveLength(4);
    expect(json.sections.map((s: { heading: string }) => s.heading)).toEqual([
      'Market Context',
      'Deal Rationale',
      'Key Risks',
      'Recommended Next Steps',
    ]);
  });

  it('returns 200 with arabic demo narrative in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'ar' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe('demo');
    expect(json.language).toBe('ar');
    expect(json.sections).toHaveLength(4);
  });

  it('returns 403 (feature_disabled) when flag is off and not in demo mode', async () => {
    process.env.DEMO_MODE = 'false';
    // EXPLAIN_DEAL_ENABLED remains 'false' (set in beforeEach)
    const { POST } = await import('@/app/api/ai/explain-deal/route');
    const res = await POST(makeReq({ matchIndex: 0, language: 'en' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('feature_disabled');
  });
});
