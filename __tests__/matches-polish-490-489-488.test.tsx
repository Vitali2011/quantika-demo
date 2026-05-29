/**
 * Tests for /matches polish bugs #488 #489 #490
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * #488 — table must not require horizontal scroll at 1440px (page container ≥ 1024px)
 * #489 — heading must show "Matches N results" (count-bearing), not static "Your Recent Matches"
 * #490 — AUTO-REFRESH · HH:MM UTC indicator must be present in MatchesClient
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const pagePath = path.join(ROOT, 'app/matches/page.tsx');
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

// ── #488 — table overflow at 1440px ──────────────────────────────────────────

describe('app/matches/page.tsx — table fits at 1440px (#488)', () => {
  it('does NOT use max-w-2xl (too narrow for 970px table)', () => {
    const src = readSource(pagePath);
    expect(src).not.toMatch(/max-w-2xl/);
  });

  it('uses a container ≥ max-w-5xl so table fits without horizontal scroll', () => {
    const src = readSource(pagePath);
    // max-w-5xl (1024px) or wider accommodates the 970px table at 1440px viewport;
    // max-w-[1280px] matches /cargo full-width container
    expect(src).toMatch(/max-w-5xl|max-w-6xl|max-w-7xl|max-w-screen|max-w-\[1280/);
  });
});

describe('app/matches/MatchesClient.tsx — table overflow wrapper (#488)', () => {
  it('table section has overflow-x-auto wrapper for narrow viewports', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/overflow-x-auto/);
  });
});

// ── #489 — heading shows count ────────────────────────────────────────────────

describe('app/matches/page.tsx — heading shows count (#489)', () => {
  it('h1 contains "Matches" and "results" to show count', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/Matches.*results|results.*Matches/);
  });

  it('does NOT use the old static heading "Your Recent Matches"', () => {
    const src = readSource(pagePath);
    expect(src).not.toMatch(/Your Recent Matches/);
  });

  it('h1 interpolates match count from server-side data', () => {
    const src = readSource(pagePath);
    // Must include the dynamic count expression
    expect(src).toMatch(/matches\.length/);
  });
});

// ── #490 — AUTO-REFRESH UTC indicator ────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — AUTO-REFRESH UTC indicator (#490)', () => {
  it('contains AUTO-REFRESH label', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/AUTO-REFRESH/);
  });

  it('shows UTC in indicator text', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/UTC/);
  });

  it('uses setInterval to update time every 60s', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/setInterval.*60000|60000.*setInterval/);
  });

  it('uses SSR-safe empty initial state (no server/client mismatch)', () => {
    const src = readSource(clientPath);
    // Empty string initial state prevents hydration mismatch
    expect(src).toMatch(/useState.*""\s*\)|useState\(""\)/);
  });

  it('renders indicator conditionally only when time is set (no flash on SSR)', () => {
    const src = readSource(clientPath);
    // {nowUtc && ...} pattern ensures nothing renders during SSR
    expect(src).toMatch(/nowUtc\s*&&/);
  });
});
