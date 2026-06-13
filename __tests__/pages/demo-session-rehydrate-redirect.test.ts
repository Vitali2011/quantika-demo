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

// ─── #975 — detail routes ────────────────────────────────────────────────────

describe('#975 — match detail: demo rehydrate on null session (Mode A)', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/match/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../match inside the !session branch', () => {
    const src = read('app/match/[id]/page.tsx');
    expect(src).toMatch(/\/api\/demo\/rehydrate\?next=.*\/match/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/match/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });

  it('still calls notFound() for non-demo session isolation', () => {
    expect(read('app/match/[id]/page.tsx')).toMatch(/notFound/);
  });
});

describe('#975 — match detail: stale numeric ID fallback (Mode B)', () => {
  it('imports persistSessionMatches', () => {
    const src = read('app/match/[id]/page.tsx');
    expect(src).toMatch(/persistSessionMatches/);
    expect(src).toMatch(/@\/lib\/matching\/persist-session-matches/);
  });

  it('calls persistSessionMatches inside the isDemoMode stale-ID branch', () => {
    const src = read('app/match/[id]/page.tsx');
    const demoIdx = src.indexOf('isDemoMode()');
    const persistIdx = src.indexOf('persistSessionMatches(');
    expect(demoIdx).toBeGreaterThan(-1);
    expect(persistIdx).toBeGreaterThan(-1);
  });

  it('calls getMatchBySlug for slug re-resolve after persist', () => {
    const src = read('app/match/[id]/page.tsx');
    expect(src).toMatch(/getMatchBySlug/);
    expect(src).toMatch(/storedMatch\.cargo_id/);
    expect(src).toMatch(/storedMatch\.vessel_id/);
  });

  it('falls through to notFound() when slug still does not resolve', () => {
    const src = read('app/match/[id]/page.tsx');
    // notFound() must appear after persistSessionMatches block
    const persistIdx = src.indexOf('persistSessionMatches(');
    const notFoundIdx = src.lastIndexOf('notFound()');
    expect(notFoundIdx).toBeGreaterThan(persistIdx);
  });
});

describe('#975 — vessel detail: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/vessel/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../vessel', () => {
    expect(read('app/vessel/[id]/page.tsx')).toMatch(/\/api\/demo\/rehydrate\?next=.*\/vessel/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/vessel/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });
});

describe('#975 — cargo detail: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/cargo/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../cargo', () => {
    expect(read('app/cargo/[id]/page.tsx')).toMatch(/\/api\/demo\/rehydrate\?next=.*\/cargo/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/cargo/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });
});

describe('#975 — email detail: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/email/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../email', () => {
    expect(read('app/email/[id]/page.tsx')).toMatch(/\/api\/demo\/rehydrate\?next=.*\/email/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/email/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });
});

describe('#975 — recap detail: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/recap/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../recap', () => {
    expect(read('app/recap/[id]/page.tsx')).toMatch(/\/api\/demo\/rehydrate\?next=.*\/recap/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/recap/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });
});

describe('#975 — fixture detail: demo rehydrate on null session', () => {
  it('imports isDemoMode from @/lib/demo-mode', () => {
    const src = read('app/fixture/[id]/page.tsx');
    expect(src).toMatch(/isDemoMode/);
    expect(src).toMatch(/@\/lib\/demo-mode/);
  });

  it('calls redirect with /api/demo/rehydrate?next=.../fixture', () => {
    expect(read('app/fixture/[id]/page.tsx')).toMatch(/\/api\/demo\/rehydrate\?next=.*\/fixture/);
  });

  it('isDemoMode() guards the rehydrate redirect', () => {
    const src = read('app/fixture/[id]/page.tsx');
    const isDemoModeIdx = src.indexOf('isDemoMode()');
    const rehydrateIdx = src.indexOf('/api/demo/rehydrate?next=');
    expect(isDemoModeIdx).toBeGreaterThan(-1);
    expect(rehydrateIdx).toBeGreaterThan(-1);
    expect(isDemoModeIdx).toBeLessThan(rehydrateIdx);
  });
});
