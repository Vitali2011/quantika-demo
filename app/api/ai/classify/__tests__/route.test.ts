/**
 * PI2 behavioral test: a body longer than the old 3000 ceiling now reaches the
 * classifier untruncated (FM-03). Drives the real classify route handler with a
 * mocked LLM. The classify route reads emails from the SESSION (not the request
 * body), so the session/csrf are mocked the same way as the parse-cargo route test.
 */
import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// Capture the user prompt the handler sends to the LLM.
const captured: { userPrompt?: string } = {};

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(async (_scope: string, _system: string, user: string) => {
    captured.userPrompt = user;
    return { classifications: [{ id: '1', category: 'OTHER', urgency: 'low', confidence: 0.5 }] };
  }),
}));

jest.mock('@/lib/openai', () => ({
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'LLMTimeoutError';
    }
  },
}));

// Force live-LLM path (not the demo/cached short-circuit).
jest.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => false,
}));

// CSRF always valid in the test harness.
jest.mock('@/lib/csrf', () => ({
  validateCsrf: () => true,
}));

jest.mock('@/lib/session', () => {
  const getSession = jest.fn();
  const updateSession = jest.fn();
  return {
    getSession,
    updateSession,
    requireSession: (request: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = request.cookies.get('session_id')?.value;
      const session = getSession(sessionId);
      return { session, sessionId };
    },
  };
});

import { POST } from '@/app/api/ai/classify/route';
import { getSession } from '@/lib/session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function makeEmail(id: string, body: string) {
  return {
    id,
    threadId: `thread-${id}`,
    from: 'broker@example.com',
    fromName: 'Broker',
    fromEmail: 'broker@example.com',
    to: 'me@example.com',
    subject: 'Position list',
    date: '2026-06-22',
    body,
    snippet: body.slice(0, 50),
    labelIds: [],
  };
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', Cookie: 'session_id=sess-1' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  captured.userPrompt = undefined;
});

describe('classify route — FM-03 body no longer truncated at 3000 (PI2 behavioral)', () => {
  it('sends a 5000-char body to the LLM without cutting it at 3000', async () => {
    const longBody = 'MV TEST open Rotterdam. ' + 'x'.repeat(5000);
    mockGetSession.mockReturnValue({
      id: 'sess-1',
      accessToken: 'token',
      createdAt: new Date(),
      emails: [makeEmail('1', longBody)],
      classifications: [],
      processedEmails: [],
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
      matches: [],
      recaps: [],
      commissionSummary: null,
      counterparties: [],
    } as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(captured.userPrompt).toBeDefined();
    // Old behavior truncated to ~3000; new ceiling (8000) keeps the full 5000-char body.
    expect(captured.userPrompt!.length).toBeGreaterThan(3500);
  });
});
