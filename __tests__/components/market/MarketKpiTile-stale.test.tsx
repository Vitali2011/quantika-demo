/**
 * @jest-environment jsdom
 *
 * #577 regression: MarketKpiTile must show "stale data" instead of "24h" labels
 * when isStale=true (data older than 24h).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarketKpiTile } from '@/components/market/MarketKpiTile';

const BASE_PROPS = {
  label: 'BDI',
  subLabel: 'Baltic Dry',
  url: null,
  unit: 'pts',
  sparklinePath: 'M2 10 L10 8 L20 9',
  sparklineDir: 'up' as const,
  delta: { pct: '+1.2%', pts: '+14 pts', dir: 'up' as const },
};

describe('MarketKpiTile staleness', () => {
  it('shows 24h label when data is fresh (isStale=false)', () => {
    render(<MarketKpiTile {...BASE_PROPS} isStale={false} />);
    expect(screen.getByText(/24h/)).toBeInTheDocument();
    expect(screen.queryByText(/stale data/i)).not.toBeInTheDocument();
  });

  it('hides 24h label and shows stale data when isStale=true', () => {
    render(<MarketKpiTile {...BASE_PROPS} isStale={true} />);
    expect(screen.queryByText(/24h/)).not.toBeInTheDocument();
    expect(screen.getByText(/stale data/i)).toBeInTheDocument();
  });

  it('shows 24h by default (isStale omitted)', () => {
    render(<MarketKpiTile {...BASE_PROPS} />);
    expect(screen.getByText(/24h/)).toBeInTheDocument();
  });
});
