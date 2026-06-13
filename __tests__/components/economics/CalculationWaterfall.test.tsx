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
    fueleu_usd: 0, // audit A.5: new breakdown field
    gross_freight_usd: 200000,
    total_costs_usd: 68000,
    net_voyage_usd: 132000,
    daily_tce_usd: 8800,
    freight_rate_usd_per_mt: 25,
    quantity_mt: 8000,
    duration_days: 15,
    bunker_consumption_mt_per_day: 14,
    bunker_price_usd_per_mt: 595,
    applicable: { bunker: true, canal: false, da: true, war_risk: false, ets: false, fueleu: false }, // audit A.5: new breakdown field
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

  it('W6a: no war-risk stale badge when war_risk_rate_date is fresh (within 90 days)', () => {
    // Use a date clearly within 90 days of test execution (2026-04-12 = ~60 days before 2026-06-11)
    const breakdown = makeBreakdown({ war_risk_usd: 5000, war_risk_rate_date: '2026-04-12' });
    render(<CalculationWaterfall breakdown={breakdown} />);
    // tier='live' → badge suppressed (CalculationWaterfall only shows badge when tier !== 'live')
    expect(screen.queryByTestId('war-risk-rate-badge')).toBeNull();
  });
});

describe('CalculationWaterfall — qafix M1/M2/L1', () => {
  it('M1: duration_days renders with one decimal place, not raw float', () => {
    // 12.133333 → toFixed(1) = "12.1" (unambiguous rounding)
    const bd = makeBreakdown({ duration_days: 12.133333333333333 });
    render(<CalculationWaterfall breakdown={bd} />);
    const durationEl = screen.getByTestId('duration-days');
    expect(durationEl).not.toHaveTextContent('12.133');
    expect(durationEl).toHaveTextContent('12.1');
  });

  it('M1: bunker caption shows duration with one decimal', () => {
    const bd = makeBreakdown({ duration_days: 12.133333333333333 });
    render(<CalculationWaterfall breakdown={bd} />);
    const caption = screen.getByTestId('bunker-caption');
    expect(caption).not.toHaveTextContent('12.133');
    expect(caption).toHaveTextContent('12.1');
  });

  it('M2: tce-basis row present and shows net+warRisk when war_risk_usd>0', () => {
    // daily_tce = (net_voyage + war_risk) / duration = (122000 + 10000) / 15 = 8800
    const bd = makeBreakdown({
      war_risk_usd: 10000,
      net_voyage_usd: 122000,
      daily_tce_usd: 8800,
      total_costs_usd: 78000,
      duration_days: 15,
    });
    render(<CalculationWaterfall breakdown={bd} />);
    const tceBasis = screen.getByTestId('tce-basis');
    expect(tceBasis).toHaveTextContent('$132,000');
    // final daily TCE must match
    expect(screen.getByTestId('daily-tce')).toHaveTextContent('$8,800');
  });

  it('M2: no tce-basis row when war_risk_usd=0 (math already reconciles)', () => {
    const bd = makeBreakdown({ war_risk_usd: 0, net_voyage_usd: 132000, daily_tce_usd: 8800, duration_days: 15 });
    render(<CalculationWaterfall breakdown={bd} />);
    expect(screen.queryByTestId('tce-basis')).toBeNull();
  });

  it('L1: war_risk_usd=0 does not render negative-zero display', () => {
    render(<CalculationWaterfall breakdown={makeBreakdown({ war_risk_usd: 0 })} />);
    const warRiskRow = screen.getByTestId('cost-war-risk');
    expect(warRiskRow).not.toHaveTextContent('$-0');
    expect(warRiskRow).not.toHaveTextContent('-$0');
  });
});
