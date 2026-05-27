/**
 * #575 regression guard: /matches /cargo /vessels /recap /email must NOT
 * redirect to /dashboard when user has no session (empty account).
 * #576 regression guard: dashboard must show KPIStrip even with 0 emails.
 *
 * These are static-analysis tests that verify the source code does not contain
 * the problematic redirect pattern for the no-session case.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('#575: pages must not redirect to /dashboard on missing session', () => {
  const pages = [
    'app/matches/page.tsx',
    'app/cargo/page.tsx',
    'app/vessels/page.tsx',
    'app/recap/page.tsx',
    'app/email/page.tsx',
  ];

  for (const page of pages) {
    it(`${page}: shows empty state instead of redirect when no session`, () => {
      const src = read(page);
      // Must use the null-safe pattern: session = sessionId ? getSession(sessionId) : null
      expect(src).toMatch(/getSession\(sessionId\) : null/);
      // Must NOT redirect on missing sessionId/session (old bug pattern)
      expect(src).not.toMatch(/if \(!sessionId\) redirect/);
      expect(src).not.toMatch(/if \(!session\) redirect/);
    });
  }

  it('app/matches/page.tsx: no longer redirects based on MATCHES_ENABLED env var', () => {
    const src = read('app/matches/page.tsx');
    expect(src).not.toMatch(/MATCHES_ENABLED.*redirect/);
  });
});

describe('#576: dashboard shows KPIStrip in empty state', () => {
  it('DashboardKpiStrip rendered before emails.length === 0 early return', () => {
    const src = read('app/dashboard/page.tsx');
    // KPIStrip should appear inside the emails.length === 0 branch
    const emptyBlock = src.match(/emails\.length === 0\s*\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(emptyBlock).toContain('DashboardKpiStrip');
  });
});
