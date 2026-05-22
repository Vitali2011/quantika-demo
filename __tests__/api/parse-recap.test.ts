/**
 * Tests for POST /api/ai/parse-recap
 *
 * Session-scoped fixture recap parser. Tests: CSRF, session guard,
 * and the early-return when no fixture recaps exist in session.
 * LLM call is mocked — focus is on route plumbing, not LLM output.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(async () => '[]'),
}));

jest.mock('@/lib/email-cache', () => ({
  getCachedParses: jest.fn(() => new Map()),
  saveParsedResults: jest.fn(),
  hashParserVersion: jest.fn(() => 'v1'),
}));

import { requireSession, updateSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/ai/parse-recap', { method: 'POST' });
}

describe('POST /api/ai/parse-recap', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockUpdateSession.mockReset();
    mockRequireSession.mockReturnValue({
      sessionId: 'sid',
      session: {
        emails: [],
        classifications: [],
        accountId: null,
      },
    });
  });

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/ai/parse-recap/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/ai/parse-recap/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 with count=0 when no FIXTURE_RECAP emails in session', async () => {
    // No classifications → no fixture recaps to parse
    mockRequireSession.mockReturnValue({
      sessionId: 'sid',
      session: {
        emails: [{ id: 'e1', from: 'test@test.com', subject: 'hi', body: '', snippet: '', date: '' }],
        classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
        accountId: null,
      },
    });
    const { POST } = await import('@/app/api/ai/parse-recap/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
    // Must update session even when empty
    expect(mockUpdateSession).toHaveBeenCalledWith('sid', expect.objectContaining({
      parsedFixtureRecaps: [],
      commissionSummary: null,
    }));
  });
});
