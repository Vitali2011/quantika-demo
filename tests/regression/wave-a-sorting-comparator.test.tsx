/**
 * @jest-environment jsdom
 *
 * test-skill adversarial review — wave-a-phantom-features (HEAD 534e72a5)
 * Class: comparator (derived ordering) + displayed-value-provenance (sort indicator).
 *
 * Attacks beyond __tests__/matches-sort-headers.test.tsx:
 *  1. Comparator CONSISTENCY property (seeded random): antisymmetry
 *     sign(cmp(a,b)) === -sign(cmp(b,a)) for every sortBy × dir over rows with
 *     nulls — an inconsistent comparator makes Array.sort produce garbage order.
 *  2. Null-sink invariant generically: for every column and BOTH directions,
 *     all null-key rows end up in a contiguous tail block.
 *  3. b268b2e8 followup: rows where BOTH fit_percent and score are null/undefined
 *     (synthetic/legacy) — no NaN, comparator returns 0, sort doesn't corrupt.
 *  4. Behavioral: dropdown select 'laycan' → earliest laycan first; footer
 *     "ranked by Laycan"; aria-sort follows the active header (provenance of the
 *     indicator, not just its presence).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/design-system/patterns/useMode', () => ({
  useMode: () => ({
    mode: 'charterer',
    isCharterer: true,
    isOwner: false,
    setMode: jest.fn(),
    t: (k: string) => k,
  }),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('@/design-system/patterns/useLiveJobs', () => ({
  useLiveJobs: () => ({ jobs: [], latestMatch: null, dismissMatch: jest.fn() }),
}));
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), action: jest.fn() }),
}));
jest.mock('@/design-system/patterns/LiveStrip', () => ({ LiveStrip: () => null }));
jest.mock('@/design-system/patterns/MatchToast', () => ({ MatchToast: () => null }));

import MatchesClient, { compareMatches, DEFAULT_DIR } from '@/app/matches/MatchesClient';
import type { SortBy, SortDir } from '@/app/matches/MatchesClient';
import type { StoredMatch } from '@/lib/matching/matches-repository';

let nextId = 1;
function mkMatch(over: Partial<StoredMatch>): StoredMatch {
  return {
    id: nextId++,
    cargo_id: `cargo:sort:${nextId}`,
    vessel_id: `vessel-${nextId}`,
    score: 85,
    reason: 'test',
    status: 'shortlist',
    user_id: null,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    reason_structured: null,
    cargo_type: 'grain',
    load_port: 'Rotterdam',
    discharge_port: 'Singapore',
    laycan_start: null,
    laycan_end: null,
    vessel_dwt: 58_000,
    tce_usd_per_day: 14_500,
    distance_nm: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    vessel_name: 'MV TEST',
    cargo_ref: null,
    fit_percent: 75,
    ...over,
  };
}

// Mulberry32 — deterministic PRNG, no deps.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_KEYS: SortBy[] = [
  'fit', 'score', 'freshness', 'tce', 'cargo_type', 'vessel_name', 'route', 'dwt', 'laycan',
];
const DIRS: SortDir[] = ['asc', 'desc'];

function randomRow(r: () => number): StoredMatch {
  const maybe = <T,>(v: T): T | null => (r() < 0.3 ? null : v);
  const names = ['ALPHA', 'bravo', 'Čharlie', 'DELTA', ''];
  return mkMatch({
    score: r() < 0.15 ? (null as unknown as number) : Math.floor(r() * 100),
    fit_percent: maybe(Math.floor(r() * 100)),
    created_at: 1_700_000_000_000 + Math.floor(r() * 1e9),
    tce_usd_per_day: maybe(Math.floor(r() * 40_000) - 5_000),
    vessel_dwt: maybe(Math.floor(r() * 90_000)),
    laycan_start: maybe(1_780_000_000_000 + Math.floor(r() * 1e10)),
    cargo_type: maybe(names[Math.floor(r() * names.length)]),
    vessel_name: maybe(names[Math.floor(r() * names.length)]),
    load_port: maybe(names[Math.floor(r() * names.length)]),
    discharge_port: maybe(names[Math.floor(r() * names.length)]),
  });
}

// +0 normalizes -0 → 0 (comparator returning -0 is equivalent to 0 for Array.sort).
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0) + 0;

describe('compareMatches — consistency property (seeded random, 300 pairs × 9 keys × 2 dirs)', () => {
  it('antisymmetry: sign(cmp(a,b)) === -sign(cmp(b,a)); cmp(a,a) === 0; never NaN', () => {
    const r = rng(0xa11ce);
    for (let i = 0; i < 300; i++) {
      const a = randomRow(r);
      const b = randomRow(r);
      for (const key of ALL_KEYS) {
        for (const dir of DIRS) {
          const ab = compareMatches(a, b, key, dir);
          const ba = compareMatches(b, a, key, dir);
          const aa = compareMatches(a, a, key, dir);
          expect(Number.isNaN(ab)).toBe(false);
          expect(Number.isNaN(ba)).toBe(false);
          expect(sign(ab)).toBe(sign(-ba));
          expect(aa === 0).toBe(true); // accepts -0: equivalent for Array.sort
        }
      }
    }
  });

  it('null-sink: for every column/dir, null-keyed rows form a contiguous tail', () => {
    const r = rng(0xbeef);
    const rows = Array.from({ length: 60 }, () => randomRow(r));
    const keyOf = (m: StoredMatch, key: SortBy): unknown => {
      switch (key) {
        case 'freshness': return m.created_at;
        case 'tce': return m.tce_usd_per_day;
        case 'dwt': return m.vessel_dwt;
        case 'laycan': return m.laycan_start;
        case 'cargo_type': return m.cargo_type || null;
        case 'vessel_name': return m.vessel_name || null;
        case 'route': return m.load_port || null; // primary key of the route compare
        default: return (m.fit_percent ?? m.score) ?? null;
      }
    };
    for (const key of ALL_KEYS) {
      for (const dir of DIRS) {
        const sorted = [...rows].sort((a, b) => compareMatches(a, b, key, dir));
        const nullFlags = sorted.map((m) => keyOf(m, key) == null);
        const firstNull = nullFlags.indexOf(true);
        if (firstNull !== -1) {
          expect(nullFlags.slice(firstNull).every(Boolean)).toBe(true);
        }
      }
    }
  });

  it('synthetic rows missing BOTH fit_percent and score → 0, no NaN (b268b2e8 followup)', () => {
    const bare = mkMatch({
      fit_percent: null,
      score: undefined as unknown as number,
    });
    const scored = mkMatch({ fit_percent: 80 });
    expect(compareMatches(bare, bare, 'fit', 'desc')).toBe(0);
    expect(Number.isNaN(compareMatches(bare, scored, 'fit', 'desc'))).toBe(false);
    // bare row sinks below the scored row in both directions
    expect(compareMatches(bare, scored, 'fit', 'desc')).toBeGreaterThan(0);
    expect(compareMatches(bare, scored, 'fit', 'asc')).toBeGreaterThan(0);
  });
});

describe('sorting wiring — dropdown + indicator provenance (behavioral)', () => {
  const rows = [
    mkMatch({ vessel_name: 'MV EARLY', laycan_start: 1_780_000_000_000, vessel_id: 'v:e', cargo_id: 'c:e' }),
    mkMatch({ vessel_name: 'MV LATE', laycan_start: 1_790_000_000_000, vessel_id: 'v:l', cargo_id: 'c:l' }),
    mkMatch({ vessel_name: 'MV NODATE', laycan_start: null, vessel_id: 'v:n', cargo_id: 'c:n' }),
  ];
  const vesselOrder = () =>
    screen.getAllByText(/^MV (EARLY|LATE|NODATE)$/).map((el) => el.textContent ?? '');

  it("dropdown 'laycan' → earliest first, null last; footer says ranked by Laycan", () => {
    render(
      <MatchesClient initialMatches={rows} isComputing={false} cargoEmailIds={[]} vesselEmailIds={[]} />,
    );
    const select = screen.getByDisplayValue('Fit %');
    fireEvent.change(select, { target: { value: 'laycan' } });
    expect(vesselOrder()).toEqual(['MV EARLY', 'MV LATE', 'MV NODATE']);
    expect(document.body.textContent).toMatch(/ranked by Laycan/i);
  });

  it('aria-sort tracks the ACTIVE column only (provenance of the indicator)', () => {
    render(
      <MatchesClient initialMatches={rows} isComputing={false} cargoEmailIds={[]} vesselEmailIds={[]} />,
    );
    const dwtBtn = screen.getByTestId('th-sort-dwt');
    fireEvent.click(dwtBtn);
    const ths = Array.from(document.querySelectorAll('th[aria-sort]'));
    const active = ths.filter((th) => th.getAttribute('aria-sort') !== 'none');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toMatch(/DWT/);
    expect(active[0].getAttribute('aria-sort')).toBe('descending');
    // toggle → ascending, still the only active one
    fireEvent.click(dwtBtn);
    expect(active[0].getAttribute('aria-sort')).toBe('ascending');
  });

  it('DEFAULT_DIR is total over SortBy (no key falls back to undefined direction)', () => {
    for (const key of ALL_KEYS) {
      expect(DEFAULT_DIR[key]).toMatch(/^(asc|desc)$/);
    }
  });
});
