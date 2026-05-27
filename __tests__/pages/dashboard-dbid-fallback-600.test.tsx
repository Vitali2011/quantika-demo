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
 * Fix: filter out goodMatches where dbId is null before building freshMatchesData.
 *
 * Tests:
 * 1. Static: page.tsx freshMatchesData section must NOT have `?? 0` fallback.
 * 2. Static: page.tsx freshMatchesData section MUST filter matches before map.
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
    src = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.tsx'), 'utf8');
  });

  it('freshMatchesData section does NOT use `?? 0` fallback for dbId', () => {
    const freshSection = src.match(/freshMatchesData[\s\S]{0,400}/)?.[0] ?? '';
    expect(freshSection).not.toMatch(/\?\?\s*0/);
  });

  it('freshMatchesData section filters out matches with missing dbId before map', () => {
    const freshSection = src.match(/freshMatchesData[\s\S]{0,400}/)?.[0] ?? '';
    expect(freshSection).toMatch(/\.filter\(/);
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
