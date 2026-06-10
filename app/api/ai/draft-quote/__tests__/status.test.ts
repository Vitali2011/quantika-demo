import { GET } from '@/app/api/ai/draft-quote/status/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  return {
    getSession,
    requireSession: (request: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = request.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const session = getSession(sessionId);
      if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session, sessionId };
    },
  };
});

const mockGetQuoteJob = jest.fn();
jest.mock('@/lib/quote-jobs/store', () => ({
  getQuoteJob: (...args: unknown[]) => mockGetQuoteJob(...args),
}));

const mockGetDb = jest.fn(() => ({}));
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDb: mockGetDb,
  })),
}));

import { getSession } from '@/lib/session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function makeRequest(jobId?: string, sessionId?: string): NextRequest {
  const url = new URL('http://localhost/api/ai/draft-quote/status');
  if (jobId) url.searchParams.set('jobId', jobId);
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest(url.toString(), { method: 'GET', headers });
}

describe('GET /api/ai/draft-quote/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without session', async () => {
    const req = makeRequest('job-1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest('job-1', 'bad-session');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when jobId missing', async () => {
    mockGetSession.mockReturnValue({ id: 'session-1' } as never);
    const req = makeRequest(undefined, 'session-1');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('jobId required');
  });

  it('returns 404 when job not found', async () => {
    mockGetSession.mockReturnValue({ id: 'session-1' } as never);
    mockGetQuoteJob.mockReturnValue(undefined);
    const req = makeRequest('job-1', 'session-1');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  it('returns 404 when job belongs to a different session', async () => {
    mockGetSession.mockReturnValue({ id: 'session-1' } as never);
    mockGetQuoteJob.mockReturnValue({ id: 'job-1', session_id: 'other-session', status: 'done', result: 'r', error: null });
    const req = makeRequest('job-1', 'session-1');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 200 with job data for an owned job', async () => {
    mockGetSession.mockReturnValue({ id: 'session-1' } as never);
    mockGetQuoteJob.mockReturnValue({ id: 'job-1', session_id: 'session-1', status: 'done', result: 'Draft text', error: null });
    const req = makeRequest('job-1', 'session-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 'job-1', status: 'done', result: 'Draft text', error: null });
  });
});
