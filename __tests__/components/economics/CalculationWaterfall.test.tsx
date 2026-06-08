/**
 * @jest-environment jsdom
 *
 * W6a: CalculationWaterfall renders DataQualityBadge on DA row when da_quality is present.
 * PI2: behavioral tests via @testing-library/react.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalculationWaterfall } from '@/components/economics/CalculationWaterfall';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

function makeBreakdown(overrides?: Partial<TCEBreakdown>): TCEBreakdown {
  return {
    bunker_usd: 50000,
    canal_usd: 0,
    da_usd: 18000,
    war_risk_usd: 0,
    ets_eur: 0,
    ets_usd: 0,
    gross_freight_usd: 200000,
    total_costs_usd: 68000,
    net_voyage_usd: 132000,
    daily_tce_usd: 8800,
    freight_rate_usd_per_mt: 25,
    quantity_mt: 8000,
    duration_days: 15,
    bunker_consumption_mt_per_day: 14,
    bunker_price_usd_per_mt: 595,
    applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false },
    ...overrides,
  };
}

describe('CalculationWaterfall — DA DataQualityBadge (W6a)', () => {
  it('renders no badge when da_quality is absent', () => {
    render(<CalculationWaterfall breakdown={makeBreakdown()} />);
    const daRow = screen.getByTestId('cost-da');
    expect(daRow.querySelector('[data-testid="data-quality-badge"]')).toBeNull();
  });

  it('renders (est.) badge when da_quality tier is estimated', () => {
    const breakdown = makeBreakdown({ da_quality: { tier: 'estimated' } });
    render(<CalculationWaterfall breakdown={breakdown} />);
    const badge = screen.getByTestId('data-quality-badge');
    expect(badge).toHaveTextContent('(est.)');
  });

  it('renders stale badge with date when da_quality tier is stale', () => {
    const breakdown = makeBreakdown({ da_quality: { tier: 'stale', asOf: '2026-05-01' } });
    render(<CalculationWaterfall breakdown={breakdown} />);
    const badge = screen.getByTestId('data-quality-badge');
    expect(badge.textContent).toMatch(/stale/);
    expect(badge.textContent).toMatch(/01-05/);
  });

  it('renders nothing (no badge) when da_quality tier is live', () => {
    const breakdown = makeBreakdown({ da_quality: { tier: 'live' } });
    render(<CalculationWaterfall breakdown={breakdown} />);
    const daRow = screen.getByTestId('cost-da');
    expect(daRow.querySelector('[data-testid="data-quality-badge"]')).toBeNull();
  });

  it('renders war_risk stale badge when war_risk_rate_date present and >90d old', () => {
    const breakdown = makeBreakdown({ war_risk_usd: 5000, war_risk_rate_date: '2024-01-01' });
    render(<CalculationWaterfall breakdown={breakdown} />);
    const badge = screen.getByTestId('war-risk-rate-badge');
    expect(badge).toBeInTheDocument();
  });
});
