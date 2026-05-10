/**
 * spec-corpus-00: foundation — etms-demo route with empty corpus
 *
 * Verifies that /api/etms-demo:
 *   - Does NOT crash when no fixture is loaded (emails = [])
 *   - Returns 303 redirect on valid CSRF POST
 *   - Creates a session with empty emails array
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

import { validateCsrf } from '@/lib/csrf';
import { createSession, updateSession } from '@/lib/session';

const mockValidateCsrf = validateCsrf as jest.Mock;
const mockCreateSession = createSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/etms-demo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session_id=mock-session-id; csrf_token=mock-csrf',
      'x-csrf-token': 'mock-csrf',
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/etms-demo — empty corpus (corpus-00 foundation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateCsrf.mockReturnValue(true);
    mockCreateSession.mockReturnValue('mock-session-id');
  });

  it('returns 303 redirect when CSRF is valid', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(303);
  });

  it('redirects to /processing', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    const res = await POST(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/processing');
  });

  it('creates a session', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    await POST(req);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('stores empty emails array in session', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    await POST(req);
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'mock-session-id',
      expect.objectContaining({ emails: [] }),
    );
  });

  it('sets session_id cookie', async () => {
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    const res = await POST(req);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('session_id=mock-session-id');
  });

  it('returns 403 when CSRF invalid', async () => {
    mockValidateCsrf.mockReturnValue(false);
    jest.resetModules();
    // Re-mock after resetModules
    jest.mock('@/lib/csrf', () => ({
      validateCsrf: jest.fn().mockReturnValue(false),
      generateCsrfToken: jest.fn().mockReturnValue('mock-csrf'),
    }));
    jest.mock('@/lib/session', () => ({
      createSession: jest.fn().mockReturnValue('mock-session-id'),
      updateSession: jest.fn(),
      requireSession: jest.fn(),
      getSession: jest.fn(),
    }));
    const { POST } = await import('@/app/api/etms-demo/route');
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
