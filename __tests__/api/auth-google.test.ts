/**
 * Tests for GET /api/auth/google
 *
 * OAuth callback: redirects to Google when no code, handles error param,
 * exchanges code for session cookie, handles exchange failure.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/google', () => ({
  getAuthUrl: jest.fn(() => 'https://accounts.google.com/o/oauth2/auth?mock=1'),
  exchangeCodeForToken: jest.fn(),
  fetchGmailProfile: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  createSession: jest.fn(() => 'sid-test'),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  generateCsrfToken: jest.fn(() => 'csrf-test'),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { exchangeCodeForToken, fetchGmailProfile } from '@/lib/google';
const mockExchangeCode = exchangeCodeForToken as jest.Mock;
const mockFetchProfile = fetchGmailProfile as jest.Mock;

describe('GET /api/auth/google', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, NEXT_PUBLIC_APP_URL: 'http://localhost:3000' };
    mockExchangeCode.mockResolvedValue('access-token-xyz');
    mockFetchProfile.mockResolvedValue('user@example.com');
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('redirects to Google auth URL when no code param', async () => {
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('accounts.google.com');
  });

  it('redirects to /?error=access_denied when error param is present', async () => {
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google?error=access_denied');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=access_denied');
  });

  it('sets session_id cookie and redirects to /processing on valid code', async () => {
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google?code=valid-code');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/processing');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('session_id=sid-test');
  });

  it('redirects to /?error=auth_failed when code exchange throws', async () => {
    mockExchangeCode.mockRejectedValueOnce(new Error('OAuth error'));
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google?code=bad-code');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=auth_failed');
  });

  // B20c: open-redirect fix — redirect origin must NOT echo untrusted Host header
  it('does NOT echo an arbitrary Host header into the redirect URL (open-redirect guard)', async () => {
    process.env = { ...origEnv }; // no NEXT_PUBLIC_APP_URL
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google?error=access_denied', {
      headers: { host: 'evil.example.com' },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('evil.example.com');
  });

  it('uses NEXT_PUBLIC_APP_URL when set, ignores Host header', async () => {
    process.env = { ...origEnv, NEXT_PUBLIC_APP_URL: 'https://app.quantika.org' };
    const { GET } = await import('@/app/api/auth/google/route');
    const req = new NextRequest('http://localhost/api/auth/google?error=access_denied', {
      headers: { host: 'evil.example.com' },
    });
    const res = await GET(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('app.quantika.org');
    expect(location).not.toContain('evil.example.com');
  });
});
