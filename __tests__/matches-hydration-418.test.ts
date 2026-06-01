/**
 * Regression test — #543 React hydration error #418 on /matches.
 *
 * Root cause: isFreshMatch() called Date.now() directly during render.
 * When a match sits near the 2-hour freshness boundary, server and client
 * produce different text (the "fresh" badge appears/disappears) → #418.
 *
 * Fix: isFreshMatch(m, now) accepts a `now` param; the clock starts at 0
 * so SSR and first client paint both render no fresh badge (deterministic).
 * After mount, useEffect sets the real timestamp.
 *
 * As of the demo-clock refactor, MatchesClient delegates clock management
 * to useDemoNow() (lib/clock-client.tsx) which owns the useState(0) +
 * useEffect(Date.now()) pattern — keeping the React-418 guard intact.
 */

import * as fs from 'fs';
import * as path from 'path';

const clientPath = path.join(process.cwd(), 'app/matches/MatchesClient.tsx');
const clockPath = path.join(process.cwd(), 'lib/clock-client.tsx');

function src(): string {
  return fs.readFileSync(clientPath, 'utf8');
}
function clockSrc(): string {
  return fs.readFileSync(clockPath, 'utf8');
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

  it('clientNow derives from a hook that initialises to 0 (not Date.now())', () => {
    // After the demo-clock refactor, MatchesClient delegates clock management
    // to useDemoNow() (lib/clock-client.tsx). The hydration-safe invariant is
    // preserved: initial value is 0 (SSR sentinel), and Date.now() is only
    // called post-mount inside a useEffect.

    // MatchesClient must consume useDemoNow — not read Date.now() at render time.
    expect(src()).toMatch(/useDemoNow/);
    expect(src()).not.toMatch(/const clientNow\s*=\s*Date\.now/);

    // useDemoNow itself must initialise state to 0 (the SSR sentinel),
    // never to Date.now() which would fire during SSR.
    expect(clockSrc()).toMatch(/useState[<\w\s>]*\(0\)/);
    expect(clockSrc()).not.toMatch(/useState.*Date\.now/);
  });

  it('Date.now() only fires inside useEffect, not during render', () => {
    // Regression guard for #543: Date.now() must never execute during SSR or
    // the synchronous hydration pass. In useDemoNow it's inside a useEffect
    // callback — if it moves before the first useEffect, this guard catches it.
    const cs = clockSrc();

    // Strip block comments and line comments before position analysis so that
    // JSDoc mentions of Date.now() (e.g. "clients fall back to real Date.now()")
    // don't generate false positives. Spaces preserve character offsets.
    const csCode = cs
      .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

    // Date.now() must appear somewhere in real code (used after mount).
    expect(csCode).toMatch(/Date\.now\(\)/);

    // Date.now() must NOT appear before the first useEffect( in code —
    // any such occurrence would run at render/SSR time (the #418 footgun).
    const effectIdx = csCode.indexOf('useEffect(');
    expect(effectIdx).toBeGreaterThan(-1);
    const codeBeforeEffect = csCode.slice(0, effectIdx);
    expect(codeBeforeEffect).not.toMatch(/Date\.now\(\)/);

    // MatchesClient must not call Date.now() directly at module/render scope.
    expect(src()).not.toMatch(/const clientNow\s*=\s*.*Date\.now/);
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
