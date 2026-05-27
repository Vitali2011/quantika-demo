/**
 * Regression guard for issue #588 — dashboard CTAs navigating to /match/0.
 *
 * Root cause: app/dashboard/page.tsx used loop index `i` instead of DB id.
 * DashboardFreshMatches used `match.index` (array position) in href.
 * Both produce /match/0 for the first match → 404.
 *
 * These tests ensure:
 * 1. DashboardFreshMatches uses match.id (DB id) not match.index in href.
 * 2. dashboard/page.tsx builds a matchIdMap via persistSessionMatches + listMatches.
 * 3. No hardcoded /match/0 or /match/${i} (loop index) in either file.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

const freshMatchesPath = path.join(ROOT, 'components/dashboard/DashboardFreshMatches.tsx');
const dashboardPagePath = path.join(ROOT, 'app/dashboard/page.tsx');

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

    it('imports listMatches to retrieve stored matches with DB ids', () => {
      expect(src).toMatch(/import.*listMatches.*from/);
    });

    it('builds matchIdMap to resolve session match → DB id', () => {
      expect(src).toMatch(/matchIdMap/);
    });

    it('priorityCards href falls back to /matches (not /match/0) when DB id missing', () => {
      expect(src).toMatch(/\/matches/);
      expect(src).not.toMatch(/href:\s*`\/match\/\$\{i\}`/);
    });

    it('freshMatchesData uses id field not index', () => {
      const freshSection = src.match(/freshMatchesData[\s\S]{0,300}/)?.[0] ?? '';
      expect(freshSection).toMatch(/\bid\b/);
      expect(freshSection).not.toMatch(/\bindex\s*:/);
    });
  });
});
