/**
 * @jest-environment jsdom
 *
 * Column-header sorting on /matches (founder request, wave-A Task 6).
 *
 * Covers:
 *  1. compareMatches unit semantics — numeric/text columns, asc/desc, nulls-last both ways
 *  2. DEFAULT_DIR pins — numbers/dates desc-first, text asc-first
 *  3. Markup/source — th sort buttons with data-testid, aria-sort, click handler
 *  4. Behavioral (RTL, mirrors __tests__/ui/matches-vessel-wrap.test.tsx setup):
 *     click DWT header → desc order; click again → asc order
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

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
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    action: jest.fn(),
  }),
}));

jest.mock('@/design-system/patterns/LiveStrip', () => ({
  LiveStrip: () => null,
}));

jest.mock('@/design-system/patterns/MatchToast', () => ({
  MatchToast: () => null,
}));

import MatchesClient, { compareMatches, DEFAULT_DIR } from '@/app/matches/MatchesClient';
import type { StoredMatch } from '@/lib/matching/matches-repository';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

let nextId = 1;
function mkMatch(over: Partial<StoredMatch>): StoredMatch {
  return {
    id: nextId++,
    cargo_id: 'cargo:sort:0',
    vessel_id: 'vessel-hash-abc123',
    score: 85,
    reason: 'test',
    status: 'shortlist',
    user_id: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    reason_structured: null,
    cargo_type: 'grain',
    load_port: 'Rotterdam',
    discharge_port: 'Singapore',
    laycan_start: null,
    laycan_end: null,
    vessel_dwt: 58000,
    tce_usd_per_day: 14500,
    distance_nm: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    vessel_name: 'MV TEST',
    cargo_ref: null,
    fit_percent: 75,
    ...over,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. compareMatches — unit semantics
// ──────────────────────────────────────────────────────────────────────────────

describe('compareMatches — numeric columns', () => {
  const dwt60 = mkMatch({ vessel_dwt: 60000 });
  const dwt30 = mkMatch({ vessel_dwt: 30000 });
  const dwtNull = mkMatch({ vessel_dwt: null });

  it('dwt desc: [60000, 30000, null] — nulls last', () => {
    const sorted = [dwtNull, dwt30, dwt60].sort((a, b) => compareMatches(a, b, 'dwt', 'desc'));
    expect(sorted.map((m) => m.vessel_dwt)).toEqual([60000, 30000, null]);
  });

  it('dwt asc: [30000, 60000, null] — nulls STILL last', () => {
    const sorted = [dwtNull, dwt60, dwt30].sort((a, b) => compareMatches(a, b, 'dwt', 'asc'));
    expect(sorted.map((m) => m.vessel_dwt)).toEqual([30000, 60000, null]);
  });

  it('laycan asc: earliest laycan_start first, null last', () => {
    const early = mkMatch({ laycan_start: 1700000000000 });
    const late = mkMatch({ laycan_start: 1800000000000 });
    const none = mkMatch({ laycan_start: null });
    const sorted = [none, late, early].sort((a, b) => compareMatches(a, b, 'laycan', 'asc'));
    expect(sorted.map((m) => m.laycan_start)).toEqual([1700000000000, 1800000000000, null]);
  });

  it('fit falls back to score when fit_percent is null', () => {
    const noFitHighScore = mkMatch({ fit_percent: null, score: 90 });
    const fit80 = mkMatch({ fit_percent: 80, score: 50 });
    const sorted = [fit80, noFitHighScore].sort((a, b) => compareMatches(a, b, 'fit', 'desc'));
    expect(sorted.map((m) => m.score)).toEqual([90, 50]);
  });

  it('tce desc: higher TCE first, null last', () => {
    const tceHigh = mkMatch({ tce_usd_per_day: 20000 });
    const tceLow = mkMatch({ tce_usd_per_day: 5000 });
    const tceNull = mkMatch({ tce_usd_per_day: null });
    const sorted = [tceNull, tceLow, tceHigh].sort((a, b) => compareMatches(a, b, 'tce', 'desc'));
    expect(sorted.map((m) => m.tce_usd_per_day)).toEqual([20000, 5000, null]);
  });
});

describe('compareMatches — text columns', () => {
  it('vessel_name asc: alphabetical with null last', () => {
    const alpha = mkMatch({ vessel_name: 'ALPHA' });
    const charlie = mkMatch({ vessel_name: 'CHARLIE' });
    const unnamed = mkMatch({ vessel_name: null });
    const sorted = [charlie, unnamed, alpha].sort((a, b) => compareMatches(a, b, 'vessel_name', 'asc'));
    expect(sorted.map((m) => m.vessel_name)).toEqual(['ALPHA', 'CHARLIE', null]);
  });

  it('route: same load_port → discharge_port decides', () => {
    const toAmsterdam = mkMatch({ load_port: 'Odessa', discharge_port: 'Amsterdam' });
    const toZanzibar = mkMatch({ load_port: 'Odessa', discharge_port: 'Zanzibar' });
    const sorted = [toZanzibar, toAmsterdam].sort((a, b) => compareMatches(a, b, 'route', 'asc'));
    expect(sorted.map((m) => m.discharge_port)).toEqual(['Amsterdam', 'Zanzibar']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. DEFAULT_DIR pins
// ──────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_DIR', () => {
  it('text columns default asc, numeric columns default desc', () => {
    expect(DEFAULT_DIR.vessel_name).toBe('asc');
    expect(DEFAULT_DIR.fit).toBe('desc');
    expect(DEFAULT_DIR.dwt).toBe('desc');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Source/markup — sortable th buttons (genre of __tests__/matches-sort.test.tsx)
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — sortable column headers (source)', () => {
  it('th sort buttons carry data-testid for dwt and laycan', () => {
    const src = readSource();
    expect(src).toMatch(/data-testid=\{?[`'"]th-sort-/);
  });

  it('th carries aria-sort reflecting active column + direction', () => {
    const src = readSource();
    expect(src).toMatch(/aria-sort/);
  });

  it('th button is wired to a click handler', () => {
    const src = readSource();
    expect(src).toMatch(/handleHeaderClick/);
    expect(src).toMatch(/onClick=\{(\(\) => )?handleHeaderClick/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Behavioral — click DWT header toggles desc → asc
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient — DWT header click sorts (behavioral)', () => {
  const rows = [
    mkMatch({ vessel_name: 'MV ALPHA', vessel_dwt: 30000, vessel_id: 'v:a', cargo_id: 'c:a' }),
    mkMatch({ vessel_name: 'MV BRAVO', vessel_dwt: 60000, vessel_id: 'v:b', cargo_id: 'c:b' }),
    mkMatch({ vessel_name: 'MV CHARLIE', vessel_dwt: 45000, vessel_id: 'v:c', cargo_id: 'c:c' }),
  ];

  function renderedVesselOrder(): string[] {
    return screen.getAllByText(/^MV (ALPHA|BRAVO|CHARLIE)$/).map((el) => el.textContent ?? '');
  }

  it('click DWT header → desc by dwt; click again → asc (nullless 3-row set)', () => {
    render(
      <MatchesClient
        initialMatches={rows}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );

    fireEvent.click(screen.getByTestId('th-sort-dwt'));
    expect(renderedVesselOrder()).toEqual(['MV BRAVO', 'MV CHARLIE', 'MV ALPHA']);

    fireEvent.click(screen.getByTestId('th-sort-dwt'));
    expect(renderedVesselOrder()).toEqual(['MV ALPHA', 'MV CHARLIE', 'MV BRAVO']);
  });
});
