/**
 * @jest-environment jsdom
 *
 * TDD tests for BunkerComparisonTable component (Delta-Step 3).
 * Covers: render candidates, winner highlight, sort order, empty/fallback, lift header, human-decision flags.
 * PI2: behavioral tests via @testing-library/react (render + screen assertions), not just source analysis.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BunkerComparisonTable } from '@/components/economics/BunkerComparisonTable';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

const CANDIDATES: BunkerCandidateResult[] = [
  {
    port: 'SGSIN',
    grade: 'VLSFO',
    priceUsdPerMt: 610,
    deviationNm: 0,
    deviationHours: 0,
    deviationFuelUsd: 0,
    timeCostUsd: 0,
    carbonCostUsd: 0,
    carbonUsdPerMt: 0,
    euaUsedFallback: true,
    effectiveUsdPerMt: 610,
    onRoute: true,
  },
  {
    port: 'AEFJR',
    grade: 'VLSFO',
    priceUsdPerMt: 590,
    deviationNm: 120,
    deviationHours: 9.6,
    deviationFuelUsd: 226,
    timeCostUsd: 6000,
    carbonCostUsd: 0,
    carbonUsdPerMt: 0,
    euaUsedFallback: true,
    effectiveUsdPerMt: 622.45,
    onRoute: true,
  },
  {
    port: 'NLRTM',
    grade: 'VLSFO',
    priceUsdPerMt: 575,
    deviationNm: 0,
    deviationHours: 0,
    deviationFuelUsd: 0,
    timeCostUsd: 0,
    carbonCostUsd: 0,
    carbonUsdPerMt: 0,
    euaUsedFallback: true,
    effectiveUsdPerMt: 575,
    onRoute: true,
  },
];

// Pre-sorted by effectiveUsdPerMt ASC (as API returns them):
const SORTED_CANDIDATES = [...CANDIDATES].sort((a, b) => a.effectiveUsdPerMt - b.effectiveUsdPerMt);
// Order: NLRTM (575), SGSIN (610), AEFJR (622.45)

describe('BunkerComparisonTable', () => {
  it('renders table with candidate rows', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    expect(screen.getByTestId('bunker-comparison-table')).toBeInTheDocument();
    // At least 3 rows rendered
    const rows = screen.getAllByTestId(/^bunker-row-/);
    expect(rows).toHaveLength(3);
  });

  it('highlights winner (first candidate, min eff $/MT) with checkmark', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const winnerRow = screen.getByTestId('bunker-row-0');
    expect(winnerRow).toHaveAttribute('data-winner', 'true');
    // Winner checkmark visible
    expect(screen.getByTestId('winner-badge')).toBeInTheDocument();
  });

  it('shows effective $/MT for each candidate', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    // NLRTM winner: 575.00
    expect(screen.getByTestId('eff-0')).toHaveTextContent('575');
    // SGSIN: 610.00
    expect(screen.getByTestId('eff-1')).toHaveTextContent('610');
    // AEFJR: 622.45
    expect(screen.getByTestId('eff-2')).toHaveTextContent('622');
  });

  it('shows spot $/MT price for each candidate', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    expect(screen.getByTestId('price-0')).toHaveTextContent('575');
    expect(screen.getByTestId('price-1')).toHaveTextContent('610');
    expect(screen.getByTestId('price-2')).toHaveTextContent('590');
  });

  it('shows deviation nm/h for candidates with detour', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    // AEFJR is index 2 after sort, has 120nm/9.6h detour
    const deviationCell = screen.getByTestId('deviation-2');
    expect(deviationCell).toHaveTextContent('120');
  });

  it('shows — for deviation when on-route with no detour', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const deviationCell = screen.getByTestId('deviation-0');
    expect(deviationCell).toHaveTextContent('—');
  });

  it('renders empty-state when candidates array is empty', () => {
    render(<BunkerComparisonTable candidates={[]} />);
    expect(screen.getByTestId('bunker-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('bunker-comparison-table')).toBeNull();
  });

  it('renders liftTonnes header when provided', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} liftTonnes={500} />);
    expect(screen.getByTestId('lift-header')).toHaveTextContent('500');
  });

  it('does not render lift header when liftTonnes not provided', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    expect(screen.queryByTestId('lift-header')).toBeNull();
  });

  it('renders recommended split when provided', () => {
    render(
      <BunkerComparisonTable
        candidates={SORTED_CANDIDATES}
        recommendedSplit="Lift 300t at Rotterdam + 200t at Singapore"
      />,
    );
    expect(screen.getByTestId('recommended-split')).toBeInTheDocument();
    expect(screen.getByTestId('recommended-split')).toHaveTextContent('300t');
  });

  it('renders human-decision flags block', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    expect(screen.getByTestId('human-decision-flags')).toBeInTheDocument();
  });

  it('human-decision flags mention laycan risk', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const flags = screen.getByTestId('human-decision-flags');
    expect(flags).toHaveTextContent(/laycan|laytim/i);
  });

  it('human-decision flags mention fuel quality', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const flags = screen.getByTestId('human-decision-flags');
    expect(flags).toHaveTextContent(/quality|fuel/i);
  });

  it('human-decision flags mention charter type', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const flags = screen.getByTestId('human-decision-flags');
    expect(flags).toHaveTextContent(/charter/i);
  });

  it('does not render non-winner row with winner styling', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    const secondRow = screen.getByTestId('bunker-row-1');
    expect(secondRow).toHaveAttribute('data-winner', 'false');
  });

  it('port name column shows human-readable name for known LOCODEs', () => {
    render(<BunkerComparisonTable candidates={SORTED_CANDIDATES} />);
    // NLRTM → Rotterdam, SGSIN → Singapore
    expect(screen.getByTestId('port-0')).toHaveTextContent(/Rotterdam/i);
    expect(screen.getByTestId('port-1')).toHaveTextContent(/Singapore/i);
  });
});
