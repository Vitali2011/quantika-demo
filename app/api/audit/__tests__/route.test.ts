import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { logAuditEvent } from '@/lib/audit';

// ── Mock dependencies ──────────────────────────────────────────────────────

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  checkCsrfRequest: jest.fn(),
}));

jest.mock('@/lib/audit', () => ({
  logAuditEvent: jest.fn(),
  getAuditTrail: jest.fn(),
  getAuditTrailBySession: jest.fn(),
}));

import { requireSession } from '@/lib/session';
import { checkCsrfRequest } from '@/lib/csrf';
import {
  getAuditTrail,
  getAuditTrailBySession,
} from '@/lib/audit';
import { GET, POST } from '@/app/api/audit/route';

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;
const mockCheckCsrf = checkCsrfRequest as jest.MockedFunction<typeof checkCsrfRequest>;
const mockGetAuditTrail = getAuditTrail as jest.MockedFunction<typeof getAuditTrail>;
const mockGetAuditTrailBySession = getAuditTrailBySession as jest.MockedFunction<typeof getAuditTrailBySession>;
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>;

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  return new Request(url, {
    method: options.method ?? 'GET',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// ── GET tests ──────────────────────────────────────────────────────────────

describe('GET /api/audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with events for valid inquiryId owned by session', async () => {
    const fakeSession = { id: 'sess-1', accessToken: 'tok' };
    mockRequireSession.mockReturnValue({ session: fakeSession as never, sessionId: 'sess-1' });

    const fakeEvents = [
      {
        id: 'evt-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        inquiryId: 'inq-1',
        actor: 'ai' as const,
        action: 'parsed' as const,
      },
    ];
    mockGetAuditTrail.mockReturnValue(fakeEvents);

    const req = makeRequest('http://localhost/api/audit?inquiryId=inq-1');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.events).toEqual(fakeEvents);
  });

  it('returns 401 when no session cookie is present', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const req = makeRequest('http://localhost/api/audit?inquiryId=inq-1');
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither inquiryId nor sessionId is provided', async () => {
    const fakeSession = { id: 'sess-1', accessToken: 'tok' };
    mockRequireSession.mockReturnValue({ session: fakeSession as never, sessionId: 'sess-1' });

    const req = makeRequest('http://localhost/api/audit');
    const res = await GET(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 403 when inquiryId belongs to a different session', async () => {
    const fakeSession = { id: 'sess-1', accessToken: 'tok' };
    mockRequireSession.mockReturnValue({ session: fakeSession as never, sessionId: 'sess-1' });

    // Return events that belong to a DIFFERENT session
    const foreignEvents = [
      {
        id: 'evt-x',
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-other',
        inquiryId: 'inq-foreign',
        actor: 'ai' as const,
        action: 'parsed' as const,
      },
    ];
    mockGetAuditTrail.mockReturnValue(foreignEvents);

    const req = makeRequest('http://localhost/api/audit?inquiryId=inq-foreign');
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

// ── POST tests ─────────────────────────────────────────────────────────────

describe('POST /api/audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when CSRF check fails', async () => {
    mockCheckCsrf.mockReturnValue(false);

    const req = makeRequest('http://localhost/api/audit', {
      method: 'POST',
      body: { actor: 'user', action: 'confirmed' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session cookie is present', async () => {
    mockCheckCsrf.mockReturnValue(true);
    const { NextResponse } = await import('next/server');
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const req = makeRequest('http://localhost/api/audit', {
      method: 'POST',
      body: { actor: 'user', action: 'confirmed' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 201 with id and timestamp on valid POST', async () => {
    mockCheckCsrf.mockReturnValue(true);
    const fakeSession = { id: 'sess-1', accessToken: 'tok' };
    mockRequireSession.mockReturnValue({ session: fakeSession as never, sessionId: 'sess-1' });
    mockLogAuditEvent.mockReturnValue({
      id: 'new-evt-id',
      timestamp: '2026-01-01T10:00:00.000Z',
      sessionId: 'sess-1',
      actor: 'user',
      action: 'confirmed',
    });

    const req = makeRequest('http://localhost/api/audit', {
      method: 'POST',
      body: { actor: 'user', action: 'confirmed' },
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe('new-evt-id');
    expect(body.timestamp).toBe('2026-01-01T10:00:00.000Z');
  });

  it('returns 400 on invalid body (unknown actor)', async () => {
    mockCheckCsrf.mockReturnValue(true);
    const fakeSession = { id: 'sess-1', accessToken: 'tok' };
    mockRequireSession.mockReturnValue({ session: fakeSession as never, sessionId: 'sess-1' });

    const req = makeRequest('http://localhost/api/audit', {
      method: 'POST',
      body: { actor: 'robot', action: 'confirmed' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
