/**
 * @jest-environment jsdom
 *
 * Behavioral regression test for route-column overflow:
 * long port names must truncate with ellipsis inside the Route <td>,
 * not spill into the adjacent DWT column.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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

import MatchesClient from '@/app/matches/MatchesClient';
import type { StoredMatch } from '@/lib/matching/matches-repository';

const LONG_LOAD = 'East Coast Greece port (unspecified)';
const LONG_DISCHARGE = 'North European Continent Atlantic Coast port';

const longRouteMatch: StoredMatch = {
  id: 2,
  cargo_id: 'cargo:route:0',
  vessel_id: 'vessel-hash-def456',
  score: 80,
  reason: 'test',
  status: 'shortlist',
  user_id: null,
  created_at: Date.now() - 1000,
  updated_at: Date.now() - 1000,
  reason_structured: null,
  cargo_type: 'BULK',
  load_port: LONG_LOAD,
  discharge_port: LONG_DISCHARGE,
  laycan_start: null,
  laycan_end: null,
  vessel_dwt: 58000,
  tce_usd_per_day: 14500,
  distance_nm: null,
  freight_rate_usd_per_mt: null,
  freight_rate_source: null,
  vessel_name: 'MV Test',
  cargo_ref: null,
  fit_percent: 75,
};

describe('MatchesClient — route cell overflow (#route-col-overflow)', () => {
  it('renders load_port text in the route span', () => {
    render(
      <MatchesClient
        initialMatches={[longRouteMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    expect(screen.getByText(LONG_LOAD)).toBeInTheDocument();
  });

  it('route span has no whitespace-nowrap (overflow allowed to truncate)', () => {
    render(
      <MatchesClient
        initialMatches={[longRouteMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    const loadText = screen.getByText(LONG_LOAD);
    const routeSpan = loadText.closest('span[title]');
    expect(routeSpan).not.toBeNull();
    expect(routeSpan!.className).not.toMatch(/whitespace-nowrap/);
  });

  it('route span has overflow-hidden to prevent column bleed', () => {
    render(
      <MatchesClient
        initialMatches={[longRouteMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    const loadText = screen.getByText(LONG_LOAD);
    const routeSpan = loadText.closest('span[title]');
    expect(routeSpan).not.toBeNull();
    expect(routeSpan!.className).toMatch(/overflow-hidden/);
  });

  it('route span title carries full load → discharge string for hover', () => {
    render(
      <MatchesClient
        initialMatches={[longRouteMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    const loadText = screen.getByText(LONG_LOAD);
    const routeSpan = loadText.closest('span[title]');
    expect(routeSpan).not.toBeNull();
    expect(routeSpan!.getAttribute('title')).toBe(`${LONG_LOAD} → ${LONG_DISCHARGE}`);
  });

  it('load_port span has truncate class for ellipsis', () => {
    render(
      <MatchesClient
        initialMatches={[longRouteMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    const loadText = screen.getByText(LONG_LOAD);
    expect(loadText.className).toMatch(/truncate/);
  });
});
