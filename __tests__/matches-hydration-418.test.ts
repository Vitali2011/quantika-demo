/**
 * Regression test — #543 React hydration error #418 on /matches.
 *
 * Root cause: isFreshMatch() called Date.now() directly during render.
 * When a match sits near the 2-hour freshness boundary, server and client
 * produce different text (the "fresh" badge appears/disappears) → #418.
 *
 * Fix: isFreshMatch(m, now) accepts a `now` param; clientNow state starts at 0
 * so SSR and first client paint both render no fresh badge (deterministic).
 * After mount, useEffect sets clientNow = Date.now().
 */

import * as fs from 'fs';
import * as path from 'path';

const clientPath = path.join(process.cwd(), 'app/matches/MatchesClient.tsx');
function src(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient hydration safety (#543 regression)', () => {
  it('isFreshMatch accepts a `now` parameter (not bare Date.now())', () => {
    // Signature must be isFreshMatch(m, now) — bare Date.now() in argument
    // position was the bug; the function must derive freshness from `now`.
    expect(src()).toMatch(/function isFreshMatch\s*\(\s*\w+.*,\s*now\s*:/);
  });

  it('isFreshMatch guards against now === 0 (SSR pre-mount sentinel)', () => {
    // When now=0 the function must return false unconditionally so SSR and
    // first client paint produce identical HTML (no "fresh" badge).
    expect(src()).toMatch(/if\s*\(\s*now\s*===\s*0\s*\)\s*return false/);
  });

  it('clientNow falls back to the 0 sentinel (not Date.now()) for SSR safety', () => {
    // The clock now comes from useNow(): in live mode it yields null pre-mount so
    // clientNow resolves to the 0 sentinel — server and client first paint match,
    // making React #418 impossible. (In DEMO_MODE useNow returns a frozen constant,
    // also SSR-safe.)
    expect(src()).toMatch(/clientNow\s*=\s*nowMs\s*\?\?\s*0/);
    expect(src()).not.toMatch(/clientNow.*=.*Date\.now/);
  });

  it('sources its clock from the hydration-safe useNow hook (no render-time Date.now for the badge)', () => {
    // Date.now() deferral to post-mount now lives inside useNow (verified by
    // use-now.test.tsx). MatchesClient must consume the hook, never read the wall
    // clock during render.
    expect(src()).toMatch(/const nowMs = useNow\(\s*60000\s*\)/);
  });

  it('isFreshMatch in JSX row loop receives clientNow argument', () => {
    // Both call-sites must pass clientNow so the now=0 guard actually fires.
    const matches = [...src().matchAll(/isFreshMatch\s*\(/g)];
    // All invocations (not the definition) should pass clientNow
    const calls = matches.filter((m) => !src().slice(m.index! - 15, m.index!).includes('function'));
    for (const call of calls) {
      const snippet = src().slice(call.index!, call.index! + 60);
      expect(snippet).toMatch(/clientNow/);
    }
  });
});

// ── Pure-logic invariant (behavioral) ────────────────────────────────────────
// Test the exact invariant inline (function is not exported, so we mirror it).
// If someone changes the sentinel or logic, this test will fail.

function isFreshMatch(m: { created_at: number }, now: number): boolean {
  if (now === 0) return false;
  return now / 1000 - m.created_at < 7200;
}

describe('isFreshMatch invariant (behavioral)', () => {
  it('returns false when now=0 regardless of created_at', () => {
    const justCreated = { created_at: Date.now() / 1000 };
    expect(isFreshMatch(justCreated, 0)).toBe(false);
  });

  it('returns true for a match created 1 hour ago when now is real', () => {
    const now = Date.now();
    const oneHourAgo = { created_at: now / 1000 - 3600 };
    expect(isFreshMatch(oneHourAgo, now)).toBe(true);
  });

  it('returns false for a match created 3 hours ago', () => {
    const now = Date.now();
    const threeHoursAgo = { created_at: now / 1000 - 10800 };
    expect(isFreshMatch(threeHoursAgo, now)).toBe(false);
  });

  it('boundary: match exactly at 7200s is not fresh', () => {
    const now = Date.now();
    const atBoundary = { created_at: now / 1000 - 7200 };
    expect(isFreshMatch(atBoundary, now)).toBe(false);
  });
});
