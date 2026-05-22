/**
 * Tests for POST /api/ai/draft-reply
 *
 * Two union shapes: emailId (missing info follow-up) and pendingItems.
 * LLM call mocked. Tests verify routing, CSRF, session guard, and
 * validation without touching prod logic.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(async () => 'Dear Client,\n\nPlease provide missing details.\n\nBest regards'),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

const MOCK_SESSION = {
  emails: [
    {
      id: 'e1',
      from: 'alice@acme.com',
      fromName: 'Alice',
      fromEmail: 'alice@acme.com',
      subject: 'Cargo inquiry',
      body: '',
      snippet: '',
      date: '2026-05-01',
    },
  ],
  parsedCargos: [
    {
      emailId: 'e1',
      itemIndex: 0,
      missingInfo: ['weight', 'laycan'],
    },
  ],
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/draft-reply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/ai/draft-reply', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockRequireSession.mockReturnValue({ session: MOCK_SESSION, sessionId: 'sid' });
  });

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/ai/draft-reply/route');
    const res = await POST(makeReq({ emailId: 'e1' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/ai/draft-reply/route');
    const res = await POST(makeReq({ emailId: 'e1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty body (neither emailId nor pendingItems)', async () => {
    const { POST } = await import('@/app/api/ai/draft-reply/route');
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 200 with draft text when emailId is provided', async () => {
    const { POST } = await import('@/app/api/ai/draft-reply/route');
    const res = await POST(makeReq({ emailId: 'e1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.draft).toBe('string');
    expect(json.draft.length).toBeGreaterThan(0);
  });

  it('returns 200 with draft text when pendingItems is provided', async () => {
    const { POST } = await import('@/app/api/ai/draft-reply/route');
    const res = await POST(makeReq({
      pendingItems: [
        { field: 'freight_rate', status: 'pending' },
        { field: 'laycan', status: 'pending' },
      ],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.draft).toBe('string');
  });
});
