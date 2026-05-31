/**
 * Tests for POST /api/sample
 *
 * Broker trust focus: verifies the sample route loads REAL sample data
 * (not empty stubs) into the session, so a demo user sees actual cargo,
 * vessel, and classification data immediately.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
  generateCsrfToken: jest.fn(() => 'a'.repeat(64)),
}));

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/sample', { method: 'POST' });
}

describe('POST /api/sample', () => {

  it('returns 403 when CSRF fails', async () => {
    const { validateCsrf } = await import('@/lib/csrf');
    (validateCsrf as jest.Mock).mockReturnValueOnce(false);
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('creates a session and redirects to /processing', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    // 303 redirect
    expect(res.status).toBe(303);
    const location = res.headers.get('location');
    expect(location).toMatch(/\/processing$/);
  });

  it('sets session_id and csrf_token cookies', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const all = cookies.join('; ');
    expect(all).toContain('session_id=');
    expect(all).toContain('csrf_token=');
  });

  it('session contains real sample emails (not empty)', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    // Extract session id from Set-Cookie header
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c: string) => c.includes('session_id='));
    const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
    expect(sessionId).toBeTruthy();

    const session = getSession(sessionId!);
    expect(session).not.toBeNull();
    expect(session!.emails.length).toBeGreaterThan(0);
    expect(session!.parsedCargos.length).toBeGreaterThan(0);
  });

  it('session is marked isSampleData=true', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c: string) => c.includes('session_id='));
    const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
    const session = getSession(sessionId!);
    expect(session!.isSampleData).toBe(true);
  });

  it('session contains at least one guaranteed demo match', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c: string) => c.includes('session_id='));
    const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
    const session = getSession(sessionId!);
    expect(session!.matches.length).toBeGreaterThan(0);
    // Must have the guaranteed economics match
    const hasEconomicsMatch = session!.matches.some(
      (m) => m.cargoEmailId === 'demo-cargo-economics',
    );
    expect(hasEconomicsMatch).toBe(true);
  });

  it('demo session pre-seeds lowConfidenceMatches so "На проверку" tab is non-empty', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c: string) => c.includes('session_id='));
    const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
    const session = getSession(sessionId!);
    expect(session!.lowConfidenceMatches).toBeDefined();
    expect(session!.lowConfidenceMatches!.length).toBeGreaterThan(0);
    expect(session!.lowConfidenceMatches!.every((m) => m.matchLevel === 'weak')).toBe(true);
  });

  it('demo session pre-seeds insufficientData so "Мало данных" tab is non-empty', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const res = await POST(makeReq());
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const sessionCookie = cookies.find((c: string) => c.includes('session_id='));
    const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
    const session = getSession(sessionId!);
    expect(session!.insufficientData).toBeDefined();
    expect(session!.insufficientData!.length).toBeGreaterThan(0);
  });
});
