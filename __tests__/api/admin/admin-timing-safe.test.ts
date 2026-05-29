/**
 * U1 / #651 — L-3: requireAdmin must compare X-Admin-Token in constant time
 * and reject non-admins.
 *
 * We can't reliably measure wall-clock timing in CI, so the mutation-honest
 * guarantee here is two-fold:
 *   1. Behaviour: correct token → null (pass); wrong/missing → 401; unset → 500.
 *   2. Constant-time: requireAdmin must route through crypto.timingSafeEqual.
 *      We spy on the crypto module and assert it is invoked, so reverting the
 *      fix to `provided !== expected` makes the test fail.
 */
import { NextRequest } from 'next/server';
import * as crypto from 'crypto';

const ADMIN_TOKEN = 'super-secret-admin-token-1234567890';
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

describe('requireAdmin — L-3 constant-time + auth contract', () => {
  it('returns null (caller proceeds) for the correct token', () => {
    const { requireAdmin } = require('@/lib/auth/admin');
    expect(requireAdmin(reqWithToken(ADMIN_TOKEN))).toBeNull();
  });

  it('returns 401 for a wrong token of equal length', () => {
    const { requireAdmin } = require('@/lib/auth/admin');
    const wrong = 'x'.repeat(ADMIN_TOKEN.length);
    const res = requireAdmin(reqWithToken(wrong));
    expect(res).not.toBeNull();
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token of different length', () => {
    const { requireAdmin } = require('@/lib/auth/admin');
    const res = requireAdmin(reqWithToken('short'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the header is missing', () => {
    const { requireAdmin } = require('@/lib/auth/admin');
    const res = requireAdmin(reqWithToken(undefined));
    expect(res.status).toBe(401);
  });

  it('returns 500 when ADMIN_TOKEN is not configured', () => {
    delete process.env.ADMIN_TOKEN;
    const { requireAdmin } = require('@/lib/auth/admin');
    const res = requireAdmin(reqWithToken('anything'));
    expect(res.status).toBe(500);
  });

  it('uses crypto.timingSafeEqual for the comparison (mutation guard)', () => {
    // Replace the crypto module so admin.ts (which imports timingSafeEqual at
    // module load) picks up the tracked mock when it is freshly required.
    jest.resetModules();
    const timingSafeEqualMock = jest.fn(
      (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) =>
        crypto.timingSafeEqual(a, b),
    );
    jest.doMock('crypto', () => ({
      ...jest.requireActual('crypto'),
      timingSafeEqual: timingSafeEqualMock,
    }));
    const { requireAdmin } = require('@/lib/auth/admin');
    requireAdmin(reqWithToken('some-candidate-token'));
    expect(timingSafeEqualMock).toHaveBeenCalled();
    jest.dontMock('crypto');
  });
});
