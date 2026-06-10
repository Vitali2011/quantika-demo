/**
 * Tests for draft-quote route — Stage 8 async enqueue
 * Verifies: auth/validation guards (preserved), 202 enqueue success, 429 queue-full
 */
import { POST } from '@/app/api/ai/draft-quote/route';
import { NextRequest } from 'next/server';
import { Email, SessionData, ParsedCargo } from '@/lib/types';
import { QueueFullError } from '@/lib/quote-jobs/store';

// Mock the quote-jobs/store module
jest.mock('@/lib/quote-jobs/store', () => {
  const { QueueFullError: ActualQueueFullError } = jest.requireActual('@/lib/quote-jobs/store') as { QueueFullError: typeof import('@/lib/quote-jobs/store').QueueFullError };
  return {
    enqueueQuoteJob: jest.fn(() => ({ id: 'job-uuid-123', status: 'queued', session_id: 'session-1', email_id: 'email-1', match_id: null, result: null, error: null, attempts: 0, created_at: Date.now(), updated_at: Date.now() })),
    QueueFullError: ActualQueueFullError,
  };
});

// Mock ensure-worker to no-op
jest.mock('@/lib/quote-jobs/ensure-worker', () => ({
  ensureWorker: jest.fn(),
}));

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  const updateSession = jest.fn();
  return {
    getSession,
    updateSession,
    requireSession: (request: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = request.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const session = getSession(sessionId);
      if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session, sessionId };
    },
  };
});

// Mock CSRF — always valid in tests
jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

// Mock session-store — provide a fake db (enqueueQuoteJob is mocked at module level anyway)
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDb: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn() })),
    })),
  })),
}));

import { enqueueQuoteJob } from '@/lib/quote-jobs/store';
import { getSession } from '@/lib/session';

const mockEnqueueQuoteJob = enqueueQuoteJob as jest.MockedFunction<typeof enqueueQuoteJob>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function makeRequest(body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/draft-quote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const baseEmail: Email = {
  id: 'email-1',
  threadId: 'thread-1',
  from: 'John Smith <john@acme.com>',
  fromName: 'John Smith',
  fromEmail: 'john@acme.com',
  to: 'agent@freight.com',
  subject: 'Cargo inquiry from Shanghai',
  date: new Date().toISOString(),
  body: 'We need to ship 20 containers from Shanghai to Rotterdam.',
  snippet: 'We need to ship',
  labelIds: ['INBOX'],
};

const baseParsedCargo: ParsedCargo = {
  emailId: 'email-1',
  itemIndex: 0,
  originPort: { value: 'Shanghai', confidence: 'confirmed' },
  originCountry: 'CN',
  destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
  destinationCountry: 'NL',
  cargoDescription: { value: 'electronics', confidence: 'confirmed' },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'FCL',
  containerType: '20GP',
  quantity: 20,
  incoterms: null,
  preferredDates: null,
  laycan: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
};

const baseSession: SessionData = {
  id: 'session-1',
  accessToken: 'token',
  createdAt: new Date(),
  emails: [baseEmail],
  classifications: [],
  processedEmails: [],
  parsedCargos: [baseParsedCargo],
  parsedVessels: [],
  parsedFixtureRecaps: [],
  matches: [],
  recaps: [],
  commissionSummary: null,
  counterparties: [],
};

describe('POST /api/ai/draft-quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset enqueueQuoteJob to default success behaviour
    mockEnqueueQuoteJob.mockReturnValue({ id: 'job-uuid-123', status: 'queued', session_id: 'session-1', email_id: 'email-1', match_id: null, result: null, error: null, attempts: 0, created_at: Date.now(), updated_at: Date.now() });
  });

  // ── Auth / validation ──────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest({ emailId: 'email-1' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest({ emailId: 'email-1' }, 'bad-session');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing emailId', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({}, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when parsedCargo not found for emailId', async () => {
    mockGetSession.mockReturnValue({ ...baseSession, parsedCargos: [] });
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Parsed request not found');
  });

  // ── Success path: async enqueue ───────────────────────────────────────────

  it('returns 202 {jobId} and enqueues a job', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(typeof body.jobId).toBe('string');
    expect(body.status).toBe('queued');
  });

  it('returns 429 when queue is full', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockEnqueueQuoteJob.mockImplementation(() => { throw new QueueFullError(20); });
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('queue_full');
    expect(body.retryable).toBe(true);
  });

  it('forwards matchId from the body into the enqueued job', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ emailId: 'email-1', matchId: '54332' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(mockEnqueueQuoteJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ emailId: 'email-1', matchId: '54332' }),
    );
  });
});
