import {
  generateCsrfToken,
  validateCsrfToken,
  checkCsrfRequest,
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
