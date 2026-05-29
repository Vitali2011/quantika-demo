/**
 * @jest-environment jsdom
 *
 * Behavioral regression test: long vessel names must wrap (break-words), not truncate.
 * Mirrors cargo-wrap.test.tsx pattern for #636. Criterion #6 for PR 662.
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

const LONG_VESSEL = 'MV Supra-Ultramax Eastern Mediterranean Pacific Star VIII';

const longVesselMatch: StoredMatch = {
  id: 1,
  cargo_id: 'cargo:wrap:0',
  vessel_id: LONG_VESSEL,
  score: 85,
  reason: 'test',
  status: 'shortlist',
  user_id: null,
  created_at: Date.now() - 1000,
  updated_at: Date.now() - 1000,
  reason_structured: null,
  cargo_type: 'BULK',
  load_port: 'Rotterdam',
  discharge_port: 'Singapore',
  laycan_start: null,
  laycan_end: null,
  vessel_dwt: 58000,
  tce_usd_per_day: 14500,
  distance_nm: null,
  freight_rate_usd_per_mt: null,
  freight_rate_source: null,
  vessel_name: null,
  cargo_ref: null,
};

describe('MatchesClient — long vessel name wraps (#662)', () => {
  it('renders the full long vessel name without truncation', () => {
    render(
      <MatchesClient
        initialMatches={[longVesselMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    expect(screen.getByText(LONG_VESSEL)).toBeInTheDocument();
  });

  it('vessel name cell uses break-words, not truncate', () => {
    render(
      <MatchesClient
        initialMatches={[longVesselMatch]}
        isComputing={false}
        cargoEmailIds={[]}
        vesselEmailIds={[]}
      />
    );
    const vesselText = screen.getByText(LONG_VESSEL);
    expect(vesselText.className).toMatch(/break-words/);
    expect(vesselText.className).not.toMatch(/truncate/);
  });
});
