/**
 * Integration tests for eager expiry sweep in createSession.
 *
 * Verifies that calling createSession() triggers expireOldSessions(),
 * so stale rows are removed from data/sessions.db without waiting for
 * an explicit getSession() call on each expired session.
 *
 * Key distinction from lazy eviction: these tests check getSessionCount()
 * *without* calling getSession() on the stale session first. Lazy eviction
 * only fires when a session is individually accessed; eager sweep fires on
 * createSession, so the count reflects the DELETE even for "never-touched" rows.
 *
 * Isolation: jest.setup.ts sets SESSIONS_DB_PATH=':memory:', so every
 * jest.resetModules() cycle starts with a fresh in-memory SQLite DB.
 */

import { SESSION_TTL_MS } from '../constants';

describe('createSession — eager expiry sweep', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('expired rows are removed by the sweep even without accessing them individually', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSession, getSessionCount } = require('../session') as typeof import('../session');

    // Create two sessions that will expire
    createSession('tok-stale-a');
    createSession('tok-stale-b');
    expect(getSessionCount()).toBe(2);

    // Advance time past TTL — sessions are now expired
    const realNow = Date.now;
    Date.now = () => realNow() + SESSION_TTL_MS + 1000;

    try {
      // Creating a new session triggers expireOldSessions() internally.
      // Without eager sweep, the count would be 3 (stale rows + new one)
      // because we never call getSession() on the stale sessions.
      createSession('tok-new');

      // Eager sweep must have deleted the two stale rows → only 1 live session
      expect(getSessionCount()).toBe(1);
    } finally {
      Date.now = realNow;
    }
  });

  it('live sessions within TTL are preserved after createSession triggers expiry sweep', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSession, getSession, getSessionCount } = require('../session') as typeof import('../session');

    const liveId = createSession('tok-live');
    expect(getSessionCount()).toBe(1);

    // Create another session without advancing time — both should survive
    createSession('tok-second');
    expect(getSessionCount()).toBe(2);

    // The live session is still accessible
    expect(getSession(liveId)).not.toBeNull();
  });
});
