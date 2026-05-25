/**
 * Regression lock: logout functionality (#352 / #414)
 *
 * #352 — logout button removed from /more during a hydration-polish wave.
 * #414 — regression recurred after a subsequent wave touched /more.
 *
 * Guards three invariants that must never silently disappear:
 *   L1 — /more page renders a logout form targeting POST /api/auth/logout
 *   L2 — POST /api/auth/logout clears auth cookies and redirects to /login (303)
 *   L3 — /api/auth/logout is in middleware AUTH_BYPASS_PATHS (unauthenticated access allowed)
 *
 * PI2: L2 and L3 exercise real handler/middleware code, not string matching.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { webcrypto } from 'node:crypto';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// L1 — /more page must contain a logout form
// ---------------------------------------------------------------------------

describe('REGRESSION #352/#414 — L1: /more page has logout form', () => {
  const morePage = path.join(ROOT, 'app', 'more', 'page.tsx');
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(morePage)).toBe(true);
    source = fs.readFileSync(morePage, 'utf-8');
  });

  it('app/more/page.tsx exists', () => {
    expect(fs.existsSync(morePage)).toBe(true);
  });

  it('renders a <form> that POSTs to /api/auth/logout', () => {
    // Structural check: the page must include a form pointing at the logout endpoint.
    // If the logout form is removed or the action is changed, this fails.
    expect(source).toContain('action="/api/auth/logout"');
    expect(source).toContain('method="POST"');
  });

  it('includes a Log out button inside the form', () => {
    expect(source).toMatch(/Log\s+out/);
    expect(source).toContain('type="submit"');
  });
});

// ---------------------------------------------------------------------------
// L2 — POST /api/auth/logout clears cookies and returns 303 → /login
// ---------------------------------------------------------------------------

describe('REGRESSION #352/#414 — L2: POST /api/auth/logout handler', () => {
  it('returns 303 redirect', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
  });

  it('Location header points to /login', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    expect(res.headers.get('location')).toMatch(/\/login$/);
  });

  it('Set-Cookie header clears demo_auth cookie (Max-Age=0)', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('demo_auth=');
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it('clears session_id cookie', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const req = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { cookie: 'session_id=abc123; demo_auth=sometoken' },
    });
    const res = await POST(req);
    // All Set-Cookie headers combined must clear session_id
    const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const allCookies = raw.join('; ');
    expect(allCookies).toContain('session_id=');
    expect(allCookies).toMatch(/Max-Age=0/i);
  });
});

// ---------------------------------------------------------------------------
// L3 — middleware must bypass /api/auth/logout without an auth cookie
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DEMO_AUTH_ENABLED: 'true',
    DEMO_AUTH_USER: 'admin',
    DEMO_AUTH_PASSWORD: 'secret',
    DEMO_AUTH_SECRET: 'test-secret-key-that-is-long-enough!',
    NODE_ENV: 'test',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('REGRESSION #352/#414 — L3: middleware bypasses /api/auth/logout', () => {
  it('allows unauthenticated POST to /api/auth/logout (no redirect to /login)', async () => {
    const { middleware } = await import('../../middleware');
    const req = new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await middleware(req);
    // Must NOT redirect to /login — the logout handler needs to run
    expect(res.status).not.toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('/login');
  });

  it('middleware does NOT intercept /api/auth/logout even when auth is enabled', async () => {
    process.env.DEMO_AUTH_ENABLED = 'true';
    const { middleware } = await import('../../middleware');
    // No auth cookie — normally this would redirect to /login for protected routes
    const req = new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(302);
  });
});

// ---------------------------------------------------------------------------
// L4 — TopNav MoreDropdown must contain logout form (#453)
// ---------------------------------------------------------------------------

describe('REGRESSION #453 — L4: TopNav MoreDropdown has logout form', () => {
  const topNavPath = path.join(ROOT, 'design-system', 'patterns', 'TopNav.tsx');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(topNavPath, 'utf-8');
  });

  it('design-system/patterns/TopNav.tsx exists', () => {
    expect(fs.existsSync(topNavPath)).toBe(true);
  });

  it('MoreDropdown contains a <form> POSTing to /api/auth/logout', () => {
    expect(source).toContain('action="/api/auth/logout"');
    expect(source).toContain('method="POST"');
  });

  it('MoreDropdown contains a Log out submit button', () => {
    expect(source).toMatch(/Log\s+out/);
    expect(source).toContain('type="submit"');
  });
});

// ---------------------------------------------------------------------------
// L5 — BottomNav must contain logout form (#453 mobile)
// ---------------------------------------------------------------------------

describe('REGRESSION #453 — L5: BottomNav has logout form', () => {
  const bottomNavPath = path.join(ROOT, 'design-system', 'patterns', 'BottomNav.tsx');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(bottomNavPath, 'utf-8');
  });

  it('design-system/patterns/BottomNav.tsx exists', () => {
    expect(fs.existsSync(bottomNavPath)).toBe(true);
  });

  it('BottomNav contains a <form> POSTing to /api/auth/logout', () => {
    expect(source).toContain('action="/api/auth/logout"');
    expect(source).toContain('method="POST"');
  });

  it('BottomNav contains a Log out button', () => {
    expect(source).toMatch(/Log\s+out/);
  });
});

// ---------------------------------------------------------------------------
// L6 — POST /api/auth/login must redirect to /dashboard (#454)
// ---------------------------------------------------------------------------

describe('REGRESSION #454 — L6: POST /api/auth/login redirects to /dashboard', () => {
  it('redirects to /dashboard (not /) on valid credentials', async () => {
    process.env.DEMO_AUTH_ENABLED = 'true';
    process.env.DEMO_AUTH_USER = 'admin';
    process.env.DEMO_AUTH_PASSWORD = 'secret';
    process.env.DEMO_AUTH_SECRET = 'test-secret-key-that-is-long-enough!';
    const { POST } = await import('@/app/api/auth/login/route');
    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ user: 'admin', password: 'secret' }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/dashboard/);
  });

  it('does NOT redirect to bare / on valid credentials', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ user: 'admin', password: 'secret' }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const res = await POST(req);
    const location = res.headers.get('location') ?? '';
    // Must not redirect to bare root — that was the bug
    expect(location).not.toMatch(/^http:\/\/localhost\/$/);
  });
});
