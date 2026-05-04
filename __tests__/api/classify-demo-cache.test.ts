/**
 * wave-γ-1.5-A: integration tests for classify demo pre-parse cache.
 *
 * Cycle 1: /api/ai/classify early-returns for demo session — no LLM call
 * Cycle 2: /api/ai/classify still hits LLM for non-demo session (regression guard)
 * Cycle 3: /api/ai/classify still hits LLM when classifications empty (falls through)
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { SessionData } from '@/lib/types';
import type { requireSession as RequireSessionFn } from '@/lib/session';

// ── Shared mocks ──────────────────────────────────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf'),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
  createSession: jest.fn().mockReturnValue('mock-session-id'),
  getSession: jest.fn(),
}));

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {},
}));

import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
const mockRequireSession = requireSession as jest.MockedFunction<typeof RequireSessionFn>;
const mockUpdateSession = updateSession as jest.Mock;
const mockCallAiJson = callAiJson as jest.Mock;

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session_id=mock-session-id',
    },
  });
}

function makeSession(overrides: Partial<SessionData>): SessionData {
  return {
    accessToken: 'tok',
    emails: [
      {
        id: 'sample-01',
        threadId: 'thread-01',
        from: 'sender@example.com',
        fromName: 'Sender',
        fromEmail: 'sender@example.com',
        to: 'broker@example.com',
        subject: 'Cargo inquiry',
        date: new Date().toISOString(),
        body: 'Test body',
        snippet: 'Test',
        labelIds: ['INBOX'],
      },
    ],
    parsedCargos: [],
    parsedVessels: [],
    parsedRecaps: [],
    classifications: [],
    isSampleData: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as SessionData;
}

function makeClassifications(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    emailId: `sample-${String(i + 1).padStart(2, '0')}`,
    category: 'CARGO_INQUIRY' as const,
    isUnanswered: false,
    urgency: 'low' as const,
    daysWithoutReply: null,
    confidence: 1.0,
    originalSender: null,
    originalSenderCompany: null,
  }));
}

// ── Cycle 1: /api/ai/classify early-return for demo session ──────────────────

describe('Cycle 1: /api/ai/classify — demo guard early-return', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns {count:32, cached:true} without LLM call when isSampleData=true + classifications pre-seeded', async () => {
    const classifications = makeClassifications(32);

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, classifications }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/classify/route');
    const req = makeRequest('/api/ai/classify');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.count).toBe(32);
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('does NOT call updateSession when returning cached response', async () => {
    const classifications = makeClassifications(32);

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, classifications }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/classify/route');
    const req = makeRequest('/api/ai/classify');
    await POST(req);

    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});

// ── Cycle 2: /api/ai/classify falls through when classifications empty ─────────

describe('Cycle 2: /api/ai/classify — empty classifications falls through to LLM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallAiJson.mockResolvedValue({ classifications: [] });
  });

  it('does NOT early-return when isSampleData=true but classifications=[] (falls through)', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, classifications: [] }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/classify/route');
    const req = makeRequest('/api/ai/classify');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});

// ── Cycle 3: regression — non-demo session bypasses guard ─────────────────────

describe('Cycle 3: /api/ai/classify — non-demo session bypasses guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallAiJson.mockResolvedValue({ classifications: [] });
  });

  it('non-demo session (isSampleData=false) does NOT return cached:true', async () => {
    const classifications = makeClassifications(32);

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: false, classifications }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/classify/route');
    const req = makeRequest('/api/ai/classify');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });

  it('session without isSampleData (undefined) also bypasses the demo guard', async () => {
    const classifications = makeClassifications(32);

    mockRequireSession.mockReturnValue({
      session: makeSession({
        isSampleData: undefined as unknown as boolean,
        classifications,
      }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/classify/route');
    const req = makeRequest('/api/ai/classify');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});
