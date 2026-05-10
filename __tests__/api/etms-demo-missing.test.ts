/**
 * spec-corpus-05: POST /api/etms-demo when corpus file is missing
 *
 * Verifies that if loader throws CorpusNotFoundError:
 *   - Returns 503 with JSON error message
 *   - Session is NOT created
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf'),
}));

jest.mock('@/lib/session', () => ({
  createSession: jest.fn().mockReturnValue('mock-session-id'),
  updateSession: jest.fn(),
  requireSession: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock('@/lib/corpus/loader', () => {
  class CorpusNotFoundError extends Error {
    constructor(msg = 'not found') {
      super(msg);
      this.name = 'CorpusNotFoundError';
    }
  }
  return {
    loadCorpus: jest.fn().mockRejectedValue(new CorpusNotFoundError()),
    clearCorpusCache: jest.fn(),
    CorpusNotFoundError,
  };
});

import { createSession, updateSession } from '@/lib/session';
import { loadCorpus } from '@/lib/corpus/loader';

const mockCreateSession = createSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;
const mockLoadCorpus = loadCorpus as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/etms-demo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session_id=old-session; csrf_token=mock-csrf',
      'x-csrf-token': 'mock-csrf',
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/etms-demo — corpus missing (corpus-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock to throw CorpusNotFoundError on each test
    const { CorpusNotFoundError } = jest.requireMock('@/lib/corpus/loader');
    mockLoadCorpus.mockRejectedValue(new CorpusNotFoundError());
  });

  it('returns 503 when corpus file is missing', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it('returns JSON with error message', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/corpus/i);
  });

  it('does NOT create a session', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    await POST(makeRequest());
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('does NOT call updateSession', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    await POST(makeRequest());
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});
