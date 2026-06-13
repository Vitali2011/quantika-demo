/**
 * #968 — demo session-eviction rehydrate redirect.
 *
 * When getSession returns null AND isDemoMode() is true, matches/page.tsx and
 * dashboard/page.tsx must redirect to /api/demo/rehydrate?next=<page> instead
 * of rendering the "No emails yet" empty state.
 *
 * Strategy: static source-analysis (no SQLite, no Next.js runtime).
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('#968 — matches page: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/matches/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('imports redirect from next/navigation', () => {
    const src = read('app/matches/page.tsx');
    expect(src).toMatch(/redirect/);
    expect(src).toMatch(/next\/navigation/);
  });

  it('calls redirect with /api/demo/rehydrate?next=/matches inside the !session branch', () => {
    const src = read('app/matches/page.tsx');
    // The redirect call must be inside the !session block and use the correct URL
    expect(src).toMatch(/\/api\/demo\/rehydrate\?next=\/matches/);
  });

  it('isDemoMode() guards the redirect (non-demo fallback preserved)', () => {
    const src = read('app/matches/page.tsx');
    // isDemoMode() must precede the redirect for /matches
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=/matches');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    // isDemoMode check must come before the redirect call
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });

  it('still contains the "No emails yet" non-demo fallback', () => {
    const src = read('app/matches/page.tsx');
    expect(src).toMatch(/No emails yet/);
  });
});

describe('#968 — dashboard page: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/dashboard/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('imports redirect from next/navigation', () => {
    const src = read('app/dashboard/page.tsx');
    expect(src).toMatch(/redirect/);
    expect(src).toMatch(/next\/navigation/);
  });

  it('calls redirect with /api/demo/rehydrate?next=/dashboard inside the !session branch', () => {
    const src = read('app/dashboard/page.tsx');
    expect(src).toMatch(/\/api\/demo\/rehydrate\?next=\/dashboard/);
  });

  it('isDemoMode() guards the redirect (non-demo fallback preserved)', () => {
    const src = read('app/dashboard/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=/dashboard');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });

  it('still contains the "No emails yet" non-demo fallback', () => {
    const src = read('app/dashboard/page.tsx');
    expect(src).toMatch(/No emails yet/);
  });
});
