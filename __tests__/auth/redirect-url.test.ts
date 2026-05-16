import { NextRequest } from 'next/server';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';

function makeReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe('getRequestBaseUrl', () => {
  it('uses X-Forwarded-Host + X-Forwarded-Proto when present (Caddy reverse proxy)', () => {
    const req = makeReq('http://localhost:3000/api/auth/login', {
      'x-forwarded-host': 'demo.quantika.org',
      'x-forwarded-proto': 'https',
      host: 'localhost:3000',
    });
    expect(getRequestBaseUrl(req)).toBe('https://demo.quantika.org');
  });

  it('falls back to Host header with https when X-Forwarded-* missing (public host)', () => {
    const req = makeReq('http://localhost:3000/api/auth/login', {
      host: 'demo.quantika.org',
    });
    expect(getRequestBaseUrl(req)).toBe('https://demo.quantika.org');
  });

  it('falls back to Host with http for localhost (dev)', () => {
    const req = makeReq('http://localhost:3000/api/auth/login', {
      host: 'localhost:3000',
    });
    expect(getRequestBaseUrl(req)).toBe('http://localhost:3000');
  });

  it('uses 127.0.0.1 as localhost', () => {
    const req = makeReq('http://127.0.0.1:3000/api/auth/login', {
      host: '127.0.0.1:3000',
    });
    expect(getRequestBaseUrl(req)).toBe('http://127.0.0.1:3000');
  });

  it('respects explicit X-Forwarded-Proto even if Host looks like localhost', () => {
    const req = makeReq('http://localhost:3000/api/auth/login', {
      'x-forwarded-host': 'demo.quantika.org',
      'x-forwarded-proto': 'http',
      host: 'localhost:3000',
    });
    expect(getRequestBaseUrl(req)).toBe('http://demo.quantika.org');
  });

  it('falls back to request.url when all headers missing (NextRequest auto-fills host)', () => {
    const req = makeReq('http://internal:9999/api/auth/login');
    // NextRequest copies URL host into the host header automatically — accept either
    const result = getRequestBaseUrl(req);
    expect(['http://internal:9999', 'http://internal:9999/']).toContain(result + (result.endsWith('/') ? '' : ''));
  });
});
