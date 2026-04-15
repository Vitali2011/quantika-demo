import { NextRequest } from 'next/dist/server/web/spec-extension/request';

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

import { POST } from '@/app/api/ai/parse-cargo/route';
import { callAiJson } from '@/lib/openai';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }
  return new NextRequest('http://localhost/api/ai/parse-cargo', {
    method: 'POST',
    headers,
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

beforeEach(() => {
  jest.clearAllMocks();
});

// Test 1: Auth guard — no cookie
describe('auth guard', () => {
  it('returns 401 when no session_id cookie', async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'No session' });
  });

  // Test 2: Auth guard — expired session
  it('returns 401 when session is expired (getSession returns null)', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Session expired' });
  });
});

// Test 3: Empty classifications — zero cargo emails
describe('empty state', () => {
  it('returns count:0 and skips callAiJson when no CARGO_INQUIRY emails', async () => {
    mockGetSession.mockReturnValue(makeSession({ classifications: [] }));
    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(mockCallAiJson).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', { parsedCargos: [] });
  });
});

// Test 4: Single cargo email — full field mapping
describe('single cargo email', () => {
  it('maps all fields correctly from AI response', async () => {
    const session = makeSession({
      emails: [
        {
          id: 'email-1',
          threadId: 'thread-1',
          from: 'test@example.com',
          fromName: 'Test',
          fromEmail: 'test@example.com',
          to: 'me@example.com',
          subject: 'Cargo inquiry',
          date: '2026-01-01',
          body: 'Steel coils from Rotterdam',
          snippet: 'Steel coils',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-1',
          category: 'CARGO_INQUIRY',
          isUnanswered: true,
          urgency: 'high',
          daysWithoutReply: 2,
          confidence: 0.9,
          originalSender: 'Test',
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [
        {
          origin_port: { value: 'Rotterdam', confidence: 'high', source_text: 'from Rotterdam' },
          destination_port: { value: 'Singapore', confidence: 'medium' },
          cargo_description: { value: 'Steel coils', confidence: 'high' },
          weight_mt: { value: 5000, confidence: 'high' },
          cargo_type: 'BULK',
          commission_percent: '2.5',
          missing_info: ['laycan'],
        },
      ],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ count: 1 });
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);

    const [, sessionUpdate] = mockUpdateSession.mock.calls[0];
    const parsedCargos = (sessionUpdate as { parsedCargos: unknown[] }).parsedCargos;
    expect(parsedCargos).toHaveLength(1);

    const cargo = parsedCargos[0] as Record<string, unknown>;
    expect(cargo.emailId).toBe('email-1');
    expect(cargo.itemIndex).toBe(0);
    expect(cargo.originPort).toEqual({ value: 'Rotterdam', confidence: 'high', sourceText: 'from Rotterdam' });
    expect(cargo.cargoType).toBe('BULK');
    expect(cargo.commissionPercent).toBe(2.5);
    expect(cargo.missingInfo).toEqual(['laycan']);
  });
});

// Test 5: toConfidence — null/missing field
describe('toConfidence null/missing', () => {
  it('maps null and absent AI fields to null in ParsedCargo', async () => {
    const session = makeSession({
      emails: [
        {
          id: 'email-2',
          threadId: 't2',
          from: 'a@b.com',
          fromName: null,
          fromEmail: 'a@b.com',
          to: 'me@me.com',
          subject: 'Null fields test',
          date: '2026-01-02',
          body: 'body',
          snippet: '',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-2',
          category: 'CARGO_INQUIRY',
          isUnanswered: false,
          urgency: 'low',
          daysWithoutReply: null,
          confidence: 0.7,
          originalSender: null,
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [{ origin_port: null }],
    });

    const req = makeRequest('sess-1');
    await POST(req);

    const [, sessionUpdate] = mockUpdateSession.mock.calls[0];
    const parsedCargos = (sessionUpdate as { parsedCargos: unknown[] }).parsedCargos;
    const cargo = parsedCargos[0] as Record<string, unknown>;
    expect(cargo.originPort).toBeNull();
    expect(cargo.destinationPort).toBeNull();
  });
});

// Test 6: toConfidence — primitive value
describe('toConfidence primitive', () => {
  it('wraps bare string as { value, confidence: confirmed }', async () => {
    const session = makeSession({
      emails: [
        {
          id: 'email-3',
          threadId: 't3',
          from: 'x@y.com',
          fromName: null,
          fromEmail: 'x@y.com',
          to: 'me@me.com',
          subject: 'Primitive test',
          date: '2026-01-03',
          body: 'Grain',
          snippet: '',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-3',
          category: 'CARGO_INQUIRY',
          isUnanswered: false,
          urgency: 'low',
          daysWithoutReply: null,
          confidence: 0.8,
          originalSender: null,
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [{ cargo_description: 'Grain' }],
    });

    const req = makeRequest('sess-1');
    await POST(req);

    const [, sessionUpdate] = mockUpdateSession.mock.calls[0];
    const parsedCargos = (sessionUpdate as { parsedCargos: unknown[] }).parsedCargos;
    const cargo = parsedCargos[0] as Record<string, unknown>;
    expect(cargo.cargoDescription).toEqual({ value: 'Grain', confidence: 'confirmed' });
  });
});

// Test 7: Multiple items per email
describe('multiple items per email', () => {
  it('creates two ParsedCargo entries with itemIndex 0 and 1 on the same emailId', async () => {
    const session = makeSession({
      emails: [
        {
          id: 'email-4',
          threadId: 't4',
          from: 'multi@test.com',
          fromName: null,
          fromEmail: 'multi@test.com',
          to: 'me@me.com',
          subject: 'Multi item',
          date: '2026-01-04',
          body: 'Two lots',
          snippet: '',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-4',
          category: 'CARGO_INQUIRY',
          isUnanswered: true,
          urgency: 'medium',
          daysWithoutReply: 1,
          confidence: 0.85,
          originalSender: null,
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [
        { cargo_description: 'Lot A' },
        { cargo_description: 'Lot B' },
      ],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    const body = await res.json();
    expect(body).toEqual({ count: 2 });

    const [, sessionUpdate] = mockUpdateSession.mock.calls[0];
    const parsedCargos = (sessionUpdate as { parsedCargos: unknown[] }).parsedCargos;
    expect(parsedCargos).toHaveLength(2);

    const c0 = parsedCargos[0] as Record<string, unknown>;
    const c1 = parsedCargos[1] as Record<string, unknown>;
    expect(c0.emailId).toBe('email-4');
    expect(c0.itemIndex).toBe(0);
    expect(c1.emailId).toBe('email-4');
    expect(c1.itemIndex).toBe(1);
  });
});

// Test 8: Default field values
describe('default field values', () => {
  it('defaults cargoType to OTHER and missingInfo to [] when absent', async () => {
    const session = makeSession({
      emails: [
        {
          id: 'email-5',
          threadId: 't5',
          from: 'def@test.com',
          fromName: null,
          fromEmail: 'def@test.com',
          to: 'me@me.com',
          subject: 'Defaults test',
          date: '2026-01-05',
          body: 'defaults',
          snippet: '',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-5',
          category: 'CARGO_INQUIRY',
          isUnanswered: false,
          urgency: 'low',
          daysWithoutReply: null,
          confidence: 0.6,
          originalSender: null,
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [{ cargo_description: 'Some cargo' }],
    });

    const req = makeRequest('sess-1');
    await POST(req);

    const [, sessionUpdate] = mockUpdateSession.mock.calls[0];
    const parsedCargos = (sessionUpdate as { parsedCargos: unknown[] }).parsedCargos;
    const cargo = parsedCargos[0] as Record<string, unknown>;
    expect(cargo.cargoType).toBe('OTHER');
    expect(cargo.missingInfo).toEqual([]);
  });
});
