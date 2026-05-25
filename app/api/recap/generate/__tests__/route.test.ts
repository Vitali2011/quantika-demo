jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
  getProvider: jest.fn().mockReturnValue('openai'),
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

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn() })),
    })),
  })),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/recap/generate/route';
import { callAiJson } from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/recap/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [],
    classifications: [],
    processedEmails: [],
    parsedCargos: [],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
    ...overrides,
  };
}

function makeEmail(id: string, threadId: string, seq: number) {
  return {
    id,
    threadId,
    from: `broker${seq}@example.com`,
    fromName: 'Broker',
    fromEmail: `broker${seq}@example.com`,
    to: 'me@example.com',
    subject: 'NEGOTIATION THREAD',
    date: `2026-01-0${seq}`,
    body: `Email body ${seq}`,
    snippet: `Snippet ${seq}`,
    labelIds: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateSession.mockReturnValue(true);
});

describe('POST /api/recap/generate — auth guard', () => {
  it('returns 401 when no session cookie is provided', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/recap/generate — recap generation', () => {
  it('generates recap for threads with 5+ emails and returns count', async () => {
    const emails = Array.from({ length: 5 }, (_, i) =>
      makeEmail(`e${i + 1}`, 'thread-A', i + 1)
    );
    mockGetSession.mockReturnValue(makeSession({ emails }));
    mockCallAiJson.mockResolvedValue({
      points: [
        { topic: 'Freight', status: 'AGREED', current_value: '25 USD/MT', proposed_by: 'owner' },
      ],
      summary: 'Deal agreed',
    });

    const res = await POST(makeRequest('sess-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ recaps: expect.any(Array) })
    );
    const savedRecaps = (mockUpdateSession.mock.calls[0][1] as { recaps: unknown[] }).recaps;
    expect(savedRecaps).toHaveLength(1);
  });
});
