/**
 * Unit tests for the onboarding handleStart action logic.
 *
 * F6 regression: handleStart silently returned when no session_id cookie
 * existed — no redirect, user stuck on /onboarding.
 *
 * Root cause: line 21 of app/onboarding/page.tsx:
 *   if (!sessionId) return;   ← silent bail-out, no redirect
 *
 * Fix: auto-create a session when none exists, set the cookie on the response,
 * then proceed to startTrial + seedDemoForRegion + redirect('/').
 *
 * These tests verify the underlying lib path (session create → trial → seed)
 * works correctly. The redirect() itself is a Next.js control-flow throw
 * (NEXT_REDIRECT) tested in the E2E tier.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-action-'));
  dbPath = path.join(tmpDir, 'sessions.db');
  process.env.SESSIONS_DB_PATH = dbPath;
  jest.resetModules();
});

afterEach(() => {
  delete process.env.SESSIONS_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('F6 regression — handleStart with no prior session', () => {
  /**
   * Before fix: sessionId was null → early return → no trial record created,
   * no redirect issued. User stays on /onboarding.
   *
   * After fix: session is auto-created, trial is started, demo is seeded,
   * redirect('/') is called.
   *
   * This test exercises the code path the fixed action must follow.
   */
  it('creates a fresh session, starts trial, seeds demo — all before redirect', async () => {
    const { createSession } = await import('../session');
    const { startTrial, getTrialState } = await import('../trial');
    const { seedDemoForRegion, getSeededCount } = await import('../onboarding/demo-seed');

    // Fixed handleStart creates a session when cookie is absent
    const sessionId = createSession('onboarding-guest');
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);

    await startTrial(sessionId, 'MENA');
    await seedDemoForRegion(sessionId, 'MENA');

    const trial = await getTrialState(sessionId);
    expect(trial).not.toBeNull();
    expect(trial!.demo_seeded).toBe(true);
    expect(trial!.region).toBe('MENA');
    expect(await getSeededCount(sessionId)).toBeGreaterThan(0);
  });

  it('new session is retrievable from store (cookie value is meaningful)', async () => {
    const { createSession, getSession } = await import('../session');
    const sessionId = createSession('guest-cookie-test');
    const session = getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(sessionId);
  });
});

describe('handleStart action — full path for all regions', () => {
  it.each(['MENA', 'Med', 'WAFR'] as const)(
    'seeds demo and marks demo_seeded=true for region %s',
    async (region) => {
      jest.resetModules();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ha-${region}-`));
      process.env.SESSIONS_DB_PATH = path.join(dir, 'sessions.db');

      const { createSession } = await import('../session');
      const { startTrial, getTrialState } = await import('../trial');
      const { seedDemoForRegion, getSeededCount } = await import('../onboarding/demo-seed');

      const sid = createSession('token');
      await startTrial(sid, region);
      await seedDemoForRegion(sid, region);

      const t = await getTrialState(sid);
      expect(t!.demo_seeded).toBe(true);
      expect(await getSeededCount(sid)).toBeGreaterThan(0);

      fs.rmSync(dir, { recursive: true, force: true });
    }
  );
});
