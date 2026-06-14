/**
 * @jest-environment jsdom
 *
 * Regression guard for issue #600.
 *
 * Root cause: app/dashboard/page.tsx:115 had `id: dbId ?? 0` fallback.
 * When matchIdMap has no entry for a match (multi-user race / stale cache),
 * dbId is undefined → `?? 0` produces id=0 → DashboardFreshMatches renders
 * href="/match/0" → re-introduces original /match/0 bug from #588.
 *
 * Original fix: filter out goodMatches where dbId is null before building
 * freshMatchesData.
 *
 * Superseded by the single-source refactor (fix-dashboard-divergence): both the
 * KPI count and the lists now derive from deriveDashboardSurfaces ->
 * listQualifyingMatches, mapping over real StoredMatch DB rows. Every row carries
 * a real `sm.id`, so a missing/`0` id is structurally impossible — the #600
 * guarantee is stronger than the old `.filter(dbId != null)` and no longer lives
 * as a literal in page.tsx.
 *
 * Tests:
 * 1. Static: the id assigned to each fresh-match row is the row's real DB id
 *    (sm.id), never a `?? 0` fallback.
 * 2. Static: fresh-match rows are sourced from the deduped qualifying DB rows
 *    (listQualifyingMatches), not from an id-map lookup that can miss.
 * 3. Behavioral: DashboardFreshMatches never renders /match/0 when given valid ids.
 */

import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const ROOT = process.cwd();

jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

// ── Static: page.tsx source guards ───────────────────────────────────────────

describe('app/dashboard/page.tsx — issue #600 fallback guard', () => {
  let src: string;
  beforeAll(() => {
    // The fresh-match id now comes from the single-source helper, not page.tsx.
    src = fs.readFileSync(path.join(ROOT, 'lib/matching/dashboard-surfaces.ts'), 'utf8');
  });

  it('fresh-match id is the row real DB id, not a `?? 0` fallback', () => {
    const block = src.match(/const freshMatchesData[\s\S]{0,400}/)?.[0] ?? '';
    expect(block).toMatch(/id:\s*sm\.id/);
    // no `id: <x> ?? 0` style fallback for the rendered id
    expect(block).not.toMatch(/id:[^\n]*\?\?\s*0/);
  });

  it('fresh-match rows are sourced from the deduped qualifying DB rows', () => {
    // qualifying = listQualifyingMatches(...) — no id-map lookup that can miss.
    expect(src).toMatch(/listQualifyingMatches/);
    const block = src.match(/const freshMatchesData[\s\S]{0,200}/)?.[0] ?? '';
    expect(block).toMatch(/qualifying\.map/);
  });
});

// ── Behavioral: DashboardFreshMatches renders correct hrefs ──────────────────

import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';

describe('DashboardFreshMatches — behavioral (issue #600)', () => {
  it('renders links with the provided DB ids (no /match/0)', () => {
    const matches = [
      { id: 42, score: 85, matchLevel: 'HIGH', matchReasons: ['Good laycan overlap'] },
      { id: 17, score: 70, matchLevel: 'MEDIUM', matchReasons: ['Similar cargo type'] },
    ];
    render(<DashboardFreshMatches matches={matches} />);

    const links = screen.getAllByRole('link');
    const matchLinks = links.filter((l) => l.getAttribute('href')?.startsWith('/match/'));
    expect(matchLinks).toHaveLength(2);
    expect(matchLinks.map((l) => l.getAttribute('href'))).toEqual(['/match/42', '/match/17']);
    expect(matchLinks.every((l) => l.getAttribute('href') !== '/match/0')).toBe(true);
  });

  it('renders empty state when matches array is empty (no /match/0 fallback)', () => {
    render(<DashboardFreshMatches matches={[]} />);
    expect(screen.queryByRole('link', { name: /\/match\/0/ })).toBeNull();
    const matchLinks = screen.queryAllByRole('link').filter(
      (l) => l.getAttribute('href')?.startsWith('/match/'),
    );
    expect(matchLinks).toHaveLength(0);
  });
});
