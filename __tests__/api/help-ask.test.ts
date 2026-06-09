import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
  // reset fetch stub to return ok:false (RAG not available → canned answer)
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
});

async function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/help/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/help/ask', () => {
  it('returns canned answer + sources when RAG unavailable', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: 'how to connect Gmail' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { answer: string; sources: unknown[] };
    expect(body).toMatchObject({ answer: expect.any(String), sources: expect.any(Array) });
    expect(body.answer.length).toBeGreaterThan(0);
  });

  it('rejects empty query', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects short query (< 3 chars)', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: 'ab' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireSession.mockReturnValue(NextResponse.json({ error: 'No session' }, { status: 401 }));
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: 'some question here' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects numeric query (non-string type injection)', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: 12345 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects null query', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: null });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects object query (type confusion)', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: { $gt: '' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects missing body (no query key)', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON body (returns 400)', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = new NextRequest('http://localhost/api/help/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{',
    });
    const res = await POST(req);
    // json().catch(() => ({})) → query undefined → 400
    expect(res.status).toBe(400);
  });

  it('canned fallback answer is English-only (no Cyrillic) and contains stable EN token', async () => {
    const { POST } = await import('@/app/api/help/ask/route');
    const req = await makeRequest({ query: 'how to connect Gmail' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { answer: string; sources: unknown[] };
    expect(/[Ѐ-ӿ]/.test(body.answer)).toBe(false);
    expect(body.answer).toMatch(/parse emails/i);
  });
});
