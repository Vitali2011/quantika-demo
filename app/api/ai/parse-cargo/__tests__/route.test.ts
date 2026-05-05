/**
 * Tests for βf-11 — parse-cargo timeout / body-trim / regex fallback.
 *
 * Covers acceptance criteria from spec-betafix-11-parse-cargo-timeout.md:
 *   1. Route exports `maxDuration <= 60`.
 *   2. Email body > 50k chars is truncated before being sent to LLM.
 *   3. LLM timeout → graceful 200 response (no 524) with empty/low-confidence parse.
 */
import { NextRequest } from 'next/dist/server/web/spec-extension/request';

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
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

import * as routeModule from '@/app/api/ai/parse-cargo/route';
import { POST } from '@/app/api/ai/parse-cargo/route';
import { MAX_EMAIL_BODY_CHARS, LLM_TIMEOUT_MS } from '@/lib/parse-cargo-helpers';
import { callAiJson } from '@/lib/openai';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['Cookie'] = `session_id=${sessionId}`;
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

describe('βf-11: parse-cargo timeout & body trim', () => {
  it('exports maxDuration <= 60 (Cloudflare 524 cap)', () => {
    expect(typeof routeModule.maxDuration).toBe('number');
    expect(routeModule.maxDuration).toBeLessThanOrEqual(60);
    expect(routeModule.maxDuration).toBeGreaterThan(0);
  });

  it('exports a sane MAX_EMAIL_BODY_CHARS constant (truncation budget)', () => {
    expect(typeof MAX_EMAIL_BODY_CHARS).toBe('number');
    expect(MAX_EMAIL_BODY_CHARS).toBeGreaterThan(1000);
    expect(MAX_EMAIL_BODY_CHARS).toBeLessThanOrEqual(20_000);
  });

  it('exports a sane LLM_TIMEOUT_MS (< maxDuration)', () => {
    expect(typeof LLM_TIMEOUT_MS).toBe('number');
    // Timeout must leave headroom under maxDuration so we can still respond.
    expect(LLM_TIMEOUT_MS).toBeLessThan(routeModule.maxDuration * 1000);
    expect(LLM_TIMEOUT_MS).toBeGreaterThan(5_000);
  });

  it('truncates email body > 50k chars before sending to LLM', async () => {
    const huge = 'A'.repeat(60_000);
    const session = makeSession({
      emails: [
        {
          id: 'email-1',
          threadId: 'thread-1',
          from: 'test@example.com',
          fromName: 'Test',
          fromEmail: 'test@example.com',
          to: 'me@example.com',
          subject: 'Big inquiry',
          date: '2026-01-01',
          body: huge,
          snippet: 'huge',
          labelIds: [],
        },
      ],
      classifications: [
        {
          emailId: 'email-1',
          category: 'CARGO_INQUIRY',
          isUnanswered: true,
          urgency: 'high',
          daysWithoutReply: 1,
          confidence: 0.9,
          originalSender: 'Test',
          originalSenderCompany: null,
        },
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({ items: [] });

    const req = makeRequest('sess-1');
    await POST(req);

    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    const userPrompt = mockCallAiJson.mock.calls[0][0] as string;
    // Prompt header adds From/Subject/Date but main payload (body) must be trimmed
    expect(userPrompt.length).toBeLessThan(MAX_EMAIL_BODY_CHARS + 1_000);
    expect(userPrompt).toContain('[truncated]');
  });

  it('LLM timeout → graceful 200 fallback (NOT 524, NOT thrown)', async () => {
    jest.useFakeTimers();
    try {
      const session = makeSession({
        emails: [
          {
            id: 'email-1',
            threadId: 'thread-1',
            from: 'test@example.com',
            fromName: 'Test',
            fromEmail: 'test@example.com',
            to: 'me@example.com',
            subject: 'Inquiry',
            date: '2026-01-01',
            body: 'Steel coils from Rotterdam to Singapore, 5000 mt',
            snippet: 'Steel',
            labelIds: [],
          },
        ],
        classifications: [
          {
            emailId: 'email-1',
            category: 'CARGO_INQUIRY',
            isUnanswered: true,
            urgency: 'high',
            daysWithoutReply: 1,
            confidence: 0.9,
            originalSender: 'Test',
            originalSenderCompany: null,
          },
        ],
      });
      mockGetSession.mockReturnValue(session);
      // LLM "hangs" forever — Promise that never resolves.
      mockCallAiJson.mockImplementation(() => new Promise(() => {}));

      const req = makeRequest('sess-1');
      const resPromise = POST(req);

      // Advance fake timers past the timeout window.
      await jest.advanceTimersByTimeAsync(LLM_TIMEOUT_MS + 1_000);

      const res = await resPromise;
      expect(res.status).toBe(200);
      const body = await res.json();
      // Fallback: count is 0 (no LLM-derived items) — caller still gets a clean response.
      expect(body).toHaveProperty('count');
      expect(typeof body.count).toBe('number');
    } finally {
      jest.useRealTimers();
    }
  });
});
