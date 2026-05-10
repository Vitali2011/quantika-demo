/**
 * spec-corpus-05: POST /api/etms-demo when corpus is loaded
 *
 * Verifies that with a valid CSRF and corpus present:
 *   - 303 redirect to /processing
 *   - Session created with emails from corpus
 *   - CSRF cookie set
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf-new'),
}));

jest.mock('@/lib/session', () => ({
  createSession: jest.fn().mockReturnValue('mock-session-id'),
  updateSession: jest.fn(),
  requireSession: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock('@/lib/corpus/loader', () => ({
  loadCorpus: jest.fn(),
  clearCorpusCache: jest.fn(),
  CorpusNotFoundError: class CorpusNotFoundError extends Error {},
}));

import { validateCsrf } from '@/lib/csrf';
import { createSession, updateSession } from '@/lib/session';
import { loadCorpus } from '@/lib/corpus/loader';

const mockValidateCsrf = validateCsrf as jest.Mock;
const mockCreateSession = createSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;
const mockLoadCorpus = loadCorpus as jest.Mock;

const MOCK_EMAILS = [
  {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Cargo inquiry',
    date: '2026-01-01T00:00:00Z',
    body: 'We need 500mt steel from Antwerp to Dubai.',
    snippet: 'We need 500mt steel',
    labelIds: [],
  },
];

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

describe('POST /api/etms-demo — corpus loaded (corpus-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateCsrf.mockReturnValue(true);
    mockCreateSession.mockReturnValue('mock-session-id');
    mockLoadCorpus.mockResolvedValue(MOCK_EMAILS);
  });

  it('returns 303 redirect', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(303);
  });

  it('redirects to /processing', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/processing');
  });

  it('creates a session', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    await POST(makeRequest());
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('stores corpus emails in session', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    await POST(makeRequest());
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'mock-session-id',
      expect.objectContaining({ emails: MOCK_EMAILS }),
    );
  });

  it('calls loadCorpus', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    await POST(makeRequest());
    expect(mockLoadCorpus).toHaveBeenCalledTimes(1);
  });

  it('sets session_id cookie', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('session_id=mock-session-id');
  });

  it('sets csrf_token cookie', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('csrf_token=mock-csrf-new');
  });

  it('returns 403 when CSRF invalid', async () => {
    mockValidateCsrf.mockReturnValue(false);
    jest.resetModules();
    jest.mock('@/lib/csrf', () => ({
      validateCsrf: jest.fn().mockReturnValue(false),
      generateCsrfToken: jest.fn().mockReturnValue('mock-csrf-new'),
    }));
    jest.mock('@/lib/session', () => ({
      createSession: jest.fn().mockReturnValue('mock-session-id'),
      updateSession: jest.fn(),
      requireSession: jest.fn(),
      getSession: jest.fn(),
    }));
    jest.mock('@/lib/corpus/loader', () => ({
      loadCorpus: jest.fn().mockResolvedValue([]),
      clearCorpusCache: jest.fn(),
      CorpusNotFoundError: class CorpusNotFoundError extends Error {},
    }));
    const { POST } = await import('@/app/api/etms-demo/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });
});
