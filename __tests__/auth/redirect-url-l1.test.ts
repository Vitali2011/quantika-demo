/**
 * U1 / #651 — L-1: getRequestBaseUrl must not trust a client-supplied
 * X-Forwarded-Host header by default (host-header poisoning / open-redirect).
 *
 * Resolution contract after the fix:
 *   - NEXT_PUBLIC_APP_URL set                       → always used.
 *   - X-Forwarded-Host present, TRUST_PROXY_HEADERS unset → IGNORED (use Host).
 *   - X-Forwarded-Host present, TRUST_PROXY_HEADERS=true  → honoured (Caddy).
 */
import { NextRequest } from 'next/server';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TRUST_PROXY_HEADERS;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

async function baseUrl(req: NextRequest): Promise<string> {
  const { getRequestBaseUrl } = await import('@/lib/auth/redirect-url');
  return getRequestBaseUrl(req);
}

describe('getRequestBaseUrl — L-1 host-header hardening', () => {
  it('IGNORES a malicious X-Forwarded-Host when TRUST_PROXY_HEADERS is not set', async () => {
    const req = makeReq('http://localhost:3000/api/auth/login', {
      'x-forwarded-host': 'evil.attacker.example',
      'x-forwarded-proto': 'https',
      host: 'demo.quantika.org',
    });
    const result = await baseUrl(req);
    expect(result).not.toContain('evil.attacker.example');
    expect(result).toBe('https://demo.quantika.org');
  });

  it('prefers NEXT_PUBLIC_APP_URL over any header, including forwarded ones', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://demo.quantika.org';
    const req = makeReq('http://localhost:3000/api/auth/login', {
      'x-forwarded-host': 'evil.attacker.example',
      'x-forwarded-proto': 'https',
      host: 'evil.attacker.example',
    });
    const result = await baseUrl(req);
    expect(result).toBe('https://demo.quantika.org');
  });

  it('strips trailing slashes from NEXT_PUBLIC_APP_URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://demo.quantika.org/';
    const req = makeReq('http://localhost:3000/api/auth/login', { host: 'localhost:3000' });
    expect(await baseUrl(req)).toBe('https://demo.quantika.org');
  });

  it('honours X-Forwarded-Host ONLY when TRUST_PROXY_HEADERS=true (Caddy opt-in)', async () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    const req = makeReq('http://localhost:3000/api/auth/login', {
      'x-forwarded-host': 'demo.quantika.org',
      'x-forwarded-proto': 'https',
      host: 'localhost:3000',
    });
    expect(await baseUrl(req)).toBe('https://demo.quantika.org');
  });

  it('falls back to Host header when no config and no trusted proxy', async () => {
    const req = makeReq('http://localhost:3000/api/auth/login', { host: 'localhost:3000' });
    expect(await baseUrl(req)).toBe('http://localhost:3000');
  });
});
