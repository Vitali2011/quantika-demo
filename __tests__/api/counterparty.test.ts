/**
 * Tests for POST /api/ai/counterparty
 *
 * Groups session emails by sender domain using real groupByCounterparty logic.
 * Verifies the route produces real groupings from session data, not hardcoded values.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

import { requireSession, updateSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/ai/counterparty', { method: 'POST' });
}

describe('POST /api/ai/counterparty', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockUpdateSession.mockReset();
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/ai/counterparty/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    mockRequireSession.mockReturnValue({ session: { emails: [], classifications: [] }, sessionId: 'sid' });
    const { POST } = await import('@/app/api/ai/counterparty/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 200 with count 0 for empty session', async () => {
    mockRequireSession.mockReturnValue({
      sessionId: 'sid',
      session: { emails: [], classifications: [] },
    });
    const { POST } = await import('@/app/api/ai/counterparty/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
  });

  it('groups emails by domain and returns correct count', async () => {
    const emails = [
      { id: 'e1', from: 'alice@acme.com', fromName: 'Alice', fromEmail: 'alice@acme.com', snippet: '', body: '', subject: '', date: '' },
      { id: 'e2', from: 'bob@acme.com', fromName: 'Bob', fromEmail: 'bob@acme.com', snippet: '', body: '', subject: '', date: '' },
      { id: 'e3', from: 'carol@beta.org', fromName: 'Carol', fromEmail: 'carol@beta.org', snippet: '', body: '', subject: '', date: '' },
    ];
    mockRequireSession.mockReturnValue({
      sessionId: 'sid',
      session: { emails, classifications: [] },
    });
    const { POST } = await import('@/app/api/ai/counterparty/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    // 3 emails from 2 domains → 2 counterparties
    expect(json.count).toBe(2);
    // updateSession was called with the counterparties
    expect(mockUpdateSession).toHaveBeenCalledWith('sid', expect.objectContaining({
      counterparties: expect.arrayContaining([
        expect.objectContaining({ emailDomain: 'acme.com', emailCount: 2 }),
        expect.objectContaining({ emailDomain: 'beta.org', emailCount: 1 }),
      ]),
    }));
  });
});
