/**
 * BUG-4 (LOW) — requireAdmin's constant-time compare must be LENGTH-INDEPENDENT.
 *
 * The previous implementation padded both sides to max(len) before timingSafeEqual,
 * so the work (and the buffers handed to timingSafeEqual) scaled with the candidate
 * length — a length timing oracle on the admin secret. Hashing both sides to a
 * fixed-width sha256 digest first makes the comparison constant-width regardless of
 * input length.
 *
 * We can't measure wall-clock timing reliably in CI, so the mutation-honest proof is
 * structural: the buffers passed to crypto.timingSafeEqual are ALWAYS 32 bytes (the
 * sha256 digest width), no matter how long the candidate is. Reverting to the pad
 * approach makes timingSafeEqual receive variable-width buffers → this test goes red,
 * while the behaviour tests stay green.
 */
import { NextRequest } from 'next/server';
import * as cryptoNs from 'crypto';

const ADMIN_TOKEN = 'super-secret-admin-token-1234567890'; // 34 chars
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
  jest.dontMock('crypto');
  process.env = { ...ORIGINAL_ENV, ADMIN_TOKEN };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function reqWithToken(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers['X-Admin-Token'] = token;
  return new NextRequest('http://localhost/api/admin/whatever', { method: 'POST', headers });
}

/** Run requireAdmin with timingSafeEqual spied; return the byte-lengths of each call's args. */
function widthsPassedToTimingSafeEqual(token: string): Array<[number, number]> {
  jest.resetModules();
  const actual = jest.requireActual('crypto') as typeof cryptoNs;
  const captured: Array<[number, number]> = [];
  const mock = jest.fn((a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
    captured.push([a.byteLength, b.byteLength]);
    return actual.timingSafeEqual(a, b);
  });
  jest.doMock('crypto', () => ({ ...actual, timingSafeEqual: mock }));
  const { requireAdmin } = require('@/lib/auth/admin');
  requireAdmin(reqWithToken(token));
  jest.dontMock('crypto');
  return captured;
}

describe('BUG-4 — constant-WIDTH comparison (length-independence)', () => {
  it('hands timingSafeEqual fixed 32-byte buffers regardless of candidate length', () => {
    const oneChar = widthsPassedToTimingSafeEqual('x'); // far shorter than the secret
    const fiveHundred = widthsPassedToTimingSafeEqual('q'.repeat(500)); // far longer

    for (const calls of [oneChar, fiveHundred]) {
      expect(calls.length).toBeGreaterThan(0);
      for (const [a, b] of calls) {
        // sha256 digest width — independent of the input length
        expect(a).toBe(32);
        expect(b).toBe(32);
      }
    }
  });
});

describe('BUG-4 — auth contract preserved across candidate shapes', () => {
  it.each([
    ['a prefix of the real token', ADMIN_TOKEN.slice(0, 10)],
    ['the real token with trailing extra', `${ADMIN_TOKEN}EXTRA`],
    ['a wrong token of the same length', 'z'.repeat(ADMIN_TOKEN.length)],
    ['a 500-byte candidate', 'q'.repeat(500)],
    ['an empty candidate', ''],
  ])('returns 401 for %s', (_label, token) => {
    const { requireAdmin } = require('@/lib/auth/admin');
    const res = requireAdmin(reqWithToken(token));
    expect(res).not.toBeNull();
    expect(res.status).toBe(401);
  });

  it('returns null for the exact token', () => {
    const { requireAdmin } = require('@/lib/auth/admin');
    expect(requireAdmin(reqWithToken(ADMIN_TOKEN))).toBeNull();
  });

  it('returns 500 when ADMIN_TOKEN is unset', () => {
    delete process.env.ADMIN_TOKEN;
    const { requireAdmin } = require('@/lib/auth/admin');
    expect(requireAdmin(reqWithToken('anything')).status).toBe(500);
  });
});
