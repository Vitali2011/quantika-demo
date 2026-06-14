/**
 * Regression guard for issue #588 — dashboard CTAs navigating to /match/0.
 *
 * Root cause: app/dashboard/page.tsx used loop index `i` instead of DB id.
 * DashboardFreshMatches used `match.index` (array position) in href.
 * Both produce /match/0 for the first match → 404.
 *
 * These tests ensure:
 * 1. DashboardFreshMatches uses match.id (DB id) not match.index in href.
 * 2. The dashboard list rows resolve their href from a real DB id.
 * 3. No hardcoded /match/0 or /match/${i} (loop index) anywhere.
 *
 * Single-source refactor (fix-dashboard-divergence): the id-resolution mechanism
 * moved from page.tsx (matchIdMap + listMatches lookup, which could MISS and fall
 * back to /matches) into lib/matching/dashboard-surfaces.ts, which maps over real
 * StoredMatch rows — `id: sm.id` is always a real DB id, so /match/0 is now
 * structurally impossible. The page.tsx-source assertions below were re-pointed to
 * that helper; the DashboardFreshMatches.tsx component guards are unchanged.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

const freshMatchesPath = path.join(ROOT, 'components/dashboard/DashboardFreshMatches.tsx');
const dashboardPagePath = path.join(ROOT, 'app/dashboard/page.tsx');
const surfacesPath = path.join(ROOT, 'lib/matching/dashboard-surfaces.ts');

describe('Dashboard match href — issue #588 regression', () => {
  describe('DashboardFreshMatches.tsx', () => {
    let src: string;
    beforeAll(() => {
      src = fs.readFileSync(freshMatchesPath, 'utf8');
    });

    it('FreshMatchItem interface has id field (not index)', () => {
      expect(src).toMatch(/id\s*:\s*number/);
      expect(src).not.toMatch(/index\s*:\s*number/);
    });

    it('href uses match.id not match.index', () => {
      expect(src).toMatch(/href=.*`\/match\/\$\{match\.id\}`/);
      expect(src).not.toMatch(/href=.*`\/match\/\$\{match\.index\}`/);
    });

    it('key uses match.id not match.index', () => {
      expect(src).toMatch(/key=\{match\.id\}/);
      expect(src).not.toMatch(/key=\{match\.index\}/);
    });
  });

  describe('app/dashboard/page.tsx', () => {
    let src: string;
    beforeAll(() => {
      src = fs.readFileSync(dashboardPagePath, 'utf8');
    });

    it('imports persistSessionMatches to persist matches and obtain DB ids', () => {
      expect(src).toMatch(/import.*persistSessionMatches.*from/);
    });

    it('derives its list surfaces from the single-source helper', () => {
      expect(src).toMatch(/deriveDashboardSurfaces/);
    });

    it('does not hardcode /match/0 or a loop-index href', () => {
      expect(src).not.toMatch(/\/match\/0/);
      expect(src).not.toMatch(/href:\s*`\/match\/\$\{i\}`/);
    });
  });

  describe('lib/matching/dashboard-surfaces.ts (id-resolution home)', () => {
    let src: string;
    beforeAll(() => {
      src = fs.readFileSync(surfacesPath, 'utf8');
    });

    it('resolves list rows from the deduped qualifying DB rows', () => {
      expect(src).toMatch(/listQualifyingMatches/);
    });

    it('hrefs and ids use the real DB id (sm.id), never /match/0 or a loop index', () => {
      expect(src).toMatch(/href:\s*`\/match\/\$\{sm\.id\}`/);
      expect(src).toMatch(/id:\s*sm\.id/);
      expect(src).not.toMatch(/\/match\/0/);
      expect(src).not.toMatch(/`\/match\/\$\{i\}`/);
    });
  });
});
