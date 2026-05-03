/**
 * TDD tests for /api/ai/match timeout behaviour (βf3-01).
 *
 * Requirements:
 * - A-1: Happy path — mocked LLM resolves fast → HTTP 200 with count
 * - A-2: Timeout path — mocked LLM throws LLMTimeoutError → HTTP 504 JSON
 * - A-3: 504 body has { error: "ai_timeout", retryable: true }
 * - A-4: 504 is NOT a silent empty-matches fallback
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/ai/match/route';
import { LLMTimeoutError } from '@/lib/openai';

// ─── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
}));

// Mock analyzePairs so we control whether it resolves or throws
const mockAnalyzePairs = jest.fn();
jest.mock('@/lib/matching/pair-analyzer', () => ({
  ...jest.requireActual('@/lib/matching/pair-analyzer'),
  analyzePairs: (...args: unknown[]) => mockAnalyzePairs(...args),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import { requireSession, updateSession } from '@/lib/session';

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function fakeSession(overrides = {}) {
  return {
    session: {
      parsedCargos: [{ emailId: 'c1', itemIndex: 0 }],
      parsedVessels: [{ emailId: 'v1', itemIndex: 0 }],
      createdAt: new Date('2025-09-01'),
      ...overrides,
    },
    sessionId: 'test-session-id',
  };
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session_id=test-session-id',
    },
    body: JSON.stringify({}),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/ai/match — timeout handling (βf3-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockReturnValue(fakeSession() as ReturnType<typeof requireSession>);
  });

  /**
   * A-1: Happy path — fast analyzePairs (simulated 50ms) → 200 with count.
   */
  it('A-1: happy path — fast response returns 200 with count', async () => {
    mockAnalyzePairs.mockResolvedValue({ matches: [{ score: 80 }], blockedMatches: [] });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
  }, 10000);

  /**
   * A-2: analyzePairs propagates LLMTimeoutError → route returns 504.
   */
  it('A-2: LLMTimeoutError propagates to 504', async () => {
    mockAnalyzePairs.mockRejectedValue(new LLMTimeoutError('AI scoring timed out after 85s'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(504);
  }, 10000);

  /**
   * A-3: 504 body has correct fields: error="ai_timeout", retryable=true.
   */
  it('A-3: 504 body has ai_timeout error + retryable=true', async () => {
    mockAnalyzePairs.mockRejectedValue(new LLMTimeoutError('AI scoring timed out after 85s'));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(json.error).toBe('ai_timeout');
    expect(json.retryable).toBe(true);
    expect(typeof json.message).toBe('string');
    expect(json.message.length).toBeGreaterThan(0);
  }, 10000);

  /**
   * A-4: 504 is NOT a silent empty-matches fallback.
   * updateSession must NOT be called with { matches: [] } on timeout.
   */
  it('A-4: timeout does NOT silently save empty matches to session', async () => {
    mockAnalyzePairs.mockRejectedValue(new LLMTimeoutError('AI scoring timed out after 85s'));

    await POST(makeRequest());

    // updateSession should not be called with an empty matches array (silent fallback)
    const silentFallbackCall = mockUpdateSession.mock.calls.find(
      (call) => Array.isArray(call[1]?.matches) && call[1].matches.length === 0,
    );
    expect(silentFallbackCall).toBeUndefined();
  }, 10000);

  /**
   * A-5: Empty parsedCargos → 200 { count: 0 } without calling analyzePairs.
   */
  it('A-5: empty cargos → count 0 without AI call', async () => {
    mockRequireSession.mockReturnValue(
      fakeSession({ parsedCargos: [], parsedVessels: [] }) as ReturnType<typeof requireSession>,
    );

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(0);
    expect(mockAnalyzePairs).not.toHaveBeenCalled();
  });
});
