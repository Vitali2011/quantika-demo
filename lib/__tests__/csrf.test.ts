import type { NextRequest } from 'next/server';
import {
  generateCsrfToken,
  validateCsrfToken,
  checkCsrfRequest,
  validateCsrf,
  CsrfCheckable,
} from '../csrf';

describe('generateCsrfToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(10);
  });
});

describe('validateCsrfToken', () => {
  it('returns true for a valid generated token', () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(validateCsrfToken('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(validateCsrfToken(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(validateCsrfToken(undefined)).toBe(false);
  });

  it('returns false for a token with wrong length', () => {
    expect(validateCsrfToken('abc123')).toBe(false);
  });

  it('returns false for a token with uppercase characters', () => {
    const token = generateCsrfToken().toUpperCase();
    expect(validateCsrfToken(token)).toBe(false);
  });

  it('returns false for a token with non-hex characters', () => {
    const token = 'z'.repeat(64);
    expect(validateCsrfToken(token)).toBe(false);
  });
});

describe('checkCsrfRequest (integration: mock NextRequest)', () => {
  function makeRequest(cookieToken: string | null, headerToken: string | null): CsrfCheckable {
    return {
      cookies: {
        get: (name: string) =>
          name === 'csrf_token' && cookieToken !== null
            ? { value: cookieToken }
            : undefined,
      },
      headers: {
        get: (name: string) =>
          name === 'X-CSRF-Token' ? headerToken : null,
      },
    };
  }

  it('returns true when header matches cookie and both are valid tokens', () => {
    const token = generateCsrfToken();
    const req = makeRequest(token, token);
    expect(checkCsrfRequest(req)).toBe(true);
  });

  it('returns false when X-CSRF-Token header is missing', () => {
    const token = generateCsrfToken();
    const req = makeRequest(token, null);
    expect(checkCsrfRequest(req)).toBe(false);
  });

  it('returns false when csrf_token cookie is missing', () => {
    const token = generateCsrfToken();
    const req = makeRequest(null, token);
    expect(checkCsrfRequest(req)).toBe(false);
  });

  it('returns false when header and cookie differ', () => {
    const req = makeRequest(generateCsrfToken(), generateCsrfToken());
    expect(checkCsrfRequest(req)).toBe(false);
  });

  it('returns false when token is invalid format (too short)', () => {
    const req = makeRequest('short', 'short');
    expect(checkCsrfRequest(req)).toBe(false);
  });
});

describe('validateCsrf', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, writable: true, configurable: true });
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  function makeVcsrfRequest(origin: string | null, referer: string | null): NextRequest {
    return {
      headers: {
        get: (name: string): string | null => {
          if (name === 'origin') return origin;
          if (name === 'referer') return referer;
          return null;
        },
      },
    } as unknown as NextRequest;
  }

  it('returns true in NODE_ENV=development regardless of origin/referer', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
    const req = makeVcsrfRequest(null, null);
    expect(validateCsrf(req)).toBe(true);
  });

  it('returns true when origin matches NEXT_PUBLIC_APP_URL', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const req = makeVcsrfRequest('https://app.example.com', null);
    expect(validateCsrf(req)).toBe(true);
  });

  it('returns false when origin does not match NEXT_PUBLIC_APP_URL', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const req = makeVcsrfRequest('https://evil.com', null);
    expect(validateCsrf(req)).toBe(false);
  });

  it('returns true when origin absent and referer starts with NEXT_PUBLIC_APP_URL', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const req = makeVcsrfRequest(null, 'https://app.example.com/some/path');
    expect(validateCsrf(req)).toBe(true);
  });

  it('returns false when both origin and referer are absent', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const req = makeVcsrfRequest(null, null);
    expect(validateCsrf(req)).toBe(false);
  });
});
