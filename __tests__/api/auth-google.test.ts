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
});
