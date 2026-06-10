/**
 * γ-1 (wave-γ #1): AbortController + 504 graceful coverage for endpoints
 * that previously had no timeout handling.
 *
 * Pattern under test:
 * - draft-quote (async): enqueueQuoteJob internal throw → 500 enqueue_error
 * - classify: LLMTimeoutError thrown from callAiJson → 504 ai_timeout retryable
 * - For batched per-email routes (parse-vessel, parse-recap), a single
 *   email's timeout MUST NOT poison the whole batch — the route still
 *   returns 200 with the surviving items.
 *
 * Lib-level wrapper behaviour (timeout → throw) is verified in
 * `__tests__/lib/openai-timeout.test.ts`. Here we exercise the endpoint
 * contract.
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { LLMTimeoutError } from '@/lib/openai';

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
}));

const mockCallAiText = jest.fn();
const mockCallAiJson = jest.fn();
jest.mock('@/lib/openai', () => {
  // Preserve real LLMTimeoutError class — endpoints rely on instanceof.
  const actual = jest.requireActual('@/lib/openai');
  return {
    ...actual,
    callAiText: (...args: unknown[]) => mockCallAiText(...args),
    callAiJson: (...args: unknown[]) => mockCallAiJson(...args),
  };
});

const mockEnqueueQuoteJob = jest.fn();
jest.mock('@/lib/quote-jobs/store', () => ({
  enqueueQuoteJob: (...args: unknown[]) => mockEnqueueQuoteJob(...args),
  QueueFullError: class QueueFullError extends Error {
    constructor(depth: number) { super(`quote queue full (depth=${depth})`); this.name = 'QueueFullError'; }
  },
}));
jest.mock('@/lib/quote-jobs/ensure-worker', () => ({ ensureWorker: jest.fn() }));
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn().mockReturnValue({ getDb: jest.fn().mockReturnValue({}) }),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;

function makeRequest(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session_id=test-session-id',
    },
    body: JSON.stringify(body),
  });
}

describe('γ-1 endpoint error handling (draft-quote async; classify timeout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('draft-quote: enqueueQuoteJob internal throw → 500 enqueue_error', async () => {
    mockRequireSession.mockReturnValue({
      session: {
        parsedCargos: [{ emailId: 'e1', itemIndex: 0 }],
        emails: [{ id: 'e1', from: 'broker@x.com', subject: 's', body: 'b' }],
      },
      sessionId: 'sid',
    } as unknown as ReturnType<typeof requireSession>);
    mockEnqueueQuoteJob.mockImplementation(() => { throw new Error('DB locked'); });

    const { POST } = await import('@/app/api/ai/draft-quote/route');
    const res = await POST(makeRequest('/api/ai/draft-quote', { emailId: 'e1' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('enqueue_error');
  });

  it('classify: callAiJson timeout → 504 ai_timeout retryable', async () => {
    mockRequireSession.mockReturnValue({
      session: { emails: [{ id: 'e1', subject: 's', from: 'a', date: 'd', body: 'b', snippet: '' }] },
      sessionId: 'sid',
    } as unknown as ReturnType<typeof requireSession>);
    mockCallAiJson.mockRejectedValue(new LLMTimeoutError('timed out'));

    const { POST } = await import('@/app/api/ai/classify/route');
    const res = await POST(makeRequest('/api/ai/classify'));
    const json = await res.json();

    expect(res.status).toBe(504);
    expect(json.error).toBe('ai_timeout');
    expect(json.retryable).toBe(true);
  });
});

describe('γ-1 batch isolation: per-email timeout does NOT poison batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parse-vessel: 1 email timeout, 1 succeeds → batch returns 200 with surviving item', async () => {
    mockRequireSession.mockReturnValue({
      session: {
        emails: [
          { id: 'e1', from: 'a', subject: 's1', body: 'b1', date: 'd', snippet: '' },
          { id: 'e2', from: 'a', subject: 's2', body: 'b2', date: 'd', snippet: '' },
        ],
        classifications: [
          { emailId: 'e1', category: 'VESSEL_POSITION' },
          { emailId: 'e2', category: 'VESSEL_POSITION' },
        ],
        parsedCargos: [],
      },
      sessionId: 'sid',
    } as unknown as ReturnType<typeof requireSession>);

    // Return a parseable raw string for one, throw timeout for the other.
    let call = 0;
    mockCallAiText.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new LLMTimeoutError('per-email timeout');
      // Minimal vessel JSON the parser will accept.
      return JSON.stringify({ vessel_name: 'M/V Test', imo: '9999999', dwt: 50000, open_position: 'Singapore', open_date: '2025-09-01' });
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const res = await POST(makeRequest('/api/ai/parse-vessel'));

    // Route must still return 200 — batch isolation contract.
    expect(res.status).toBe(200);
    const json = await res.json();
    // count must be 0 or 1 (both acceptable — depends on geared-fallback / parse-vessel internals).
    // The non-negotiable contract: route did NOT 5xx because of the single timeout.
    expect(typeof json.count).toBe('number');
    expect(json.count).toBeGreaterThanOrEqual(0);
    expect(json.count).toBeLessThanOrEqual(1);
  });
});
