/**
 * SAFETY-CRITICAL: session expiry must use real Date.now(), never demo-frozen time.
 *
 * When DEMO_MODE=true with a past frozen date (e.g. '2020-01-01'), session
 * expiry (expires_at) MUST still be in the REAL future — not anchored to the
 * frozen demo clock, which would make every new session immediately expired.
 *
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 * "Do NOT use for: auth session expiry"
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { SessionStore } from '@/lib/session-store';
import { SESSION_TTL_MS } from '@/lib/constants';
import { _resetDemoFrozenDateCache } from '@/lib/demo-mode';

// Frozen demo date set to a past year — if session expiry used demoNow()
// the expires_at would be ~2020-01-01 and every session would be "expired".
const FROZEN_DEMO_DATE = '2020-01-01';
const FROZEN_DEMO_MS = new Date('2020-01-01T12:00:00.000Z').getTime();

function makeTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-safety-'));
  return path.join(dir, 'test.db');
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('session-store safety: expiry uses real Date.now() even in DEMO_MODE', () => {
  beforeEach(() => {
    _resetDemoFrozenDateCache();
  });

  afterEach(() => {
    _resetDemoFrozenDateCache();
  });

  it('session-store.ts does NOT import from lib/clock (demoNow)', () => {
    // Structural guard: if session-store ever imports demoNow(), this fails.
    const sessionStoreSource = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'session-store.ts'),
      'utf8',
    );
    expect(sessionStoreSource).not.toMatch(/from ['"].*clock['"]/);
    expect(sessionStoreSource).not.toMatch(/demoNow/);
    expect(sessionStoreSource).not.toMatch(/getDemoFrozenDate/);
    expect(sessionStoreSource).not.toMatch(/isDemoMode/);
  });

  it('session expires_at is in the real future, NOT anchored to frozen demo date', () => {
    withEnv(
      { DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DEMO_DATE, USE_MIGRATION_RUNNER: 'false' },
      () => {
        const dbPath = makeTempDb();
        const store = new SessionStore(dbPath);

        const before = Date.now();
        const sessionId = store.createSession('test-token-abc');
        const after = Date.now();

        // Pull expires_at directly from the DB — bypass getSession() so we
        // don't accidentally trigger the expiry-delete path.
        const row = store
          .getDb()
          .prepare<[string], { expires_at: number; created_at: number }>(
            'SELECT expires_at, created_at FROM sessions WHERE id = ?',
          )
          .get(sessionId);

        expect(row).not.toBeNull();
        const { expires_at, created_at } = row!;

        // 1. created_at must be bracketed by real wall-clock timestamps captured
        //    immediately before and after createSession() was called.
        expect(created_at).toBeGreaterThanOrEqual(before);
        expect(created_at).toBeLessThanOrEqual(after);

        // 2. expires_at must be in the REAL future (> real Date.now()).
        expect(expires_at).toBeGreaterThan(Date.now());

        // 3. expires_at must NOT be anchored to the frozen demo date.
        //    If it were, it would be ≤ FROZEN_DEMO_MS + SESSION_TTL_MS,
        //    which is approximately year 2020 — long in the past.
        const frozenExpiryUpperBound = FROZEN_DEMO_MS + SESSION_TTL_MS;
        expect(expires_at).toBeGreaterThan(frozenExpiryUpperBound);

        // 4. expires_at should be approximately created_at + SESSION_TTL_MS.
        expect(expires_at).toBeCloseTo(created_at + SESSION_TTL_MS, -3); // within 1s

        store.getDb().close();
      },
    );
  });

  it('getSession() returns the session (expiry NOT triggered by frozen demo date)', () => {
    // If expires_at were anchored to 2020, getSession() would delete the row
    // and return null — this guards against that regression.
    withEnv(
      { DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DEMO_DATE, USE_MIGRATION_RUNNER: 'false' },
      () => {
        const store = new SessionStore(makeTempDb());
        const sessionId = store.createSession('test-token-def');

        const session = store.getSession(sessionId);

        // Must NOT be null (i.e., expiry check must not have deleted it).
        expect(session).not.toBeNull();
        expect(session?.id).toBe(sessionId);
        expect(session?.accessToken).toBe('test-token-def');

        store.getDb().close();
      },
    );
  });

  it('expireOldSessions() does NOT delete a freshly created session in demo mode', () => {
    withEnv(
      { DEMO_MODE: 'true', DEMO_CLOCK: FROZEN_DEMO_DATE, USE_MIGRATION_RUNNER: 'false' },
      () => {
        const store = new SessionStore(makeTempDb());
        const sessionId = store.createSession('test-token-ghi');

        // This would wipe the session if expires_at used the frozen demo clock.
        store.expireOldSessions();

        const session = store.getSession(sessionId);
        expect(session).not.toBeNull();

        store.getDb().close();
      },
    );
  });
});
