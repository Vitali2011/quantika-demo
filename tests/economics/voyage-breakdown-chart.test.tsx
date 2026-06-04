/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { VoyageBreakdownChart } from '@/components/economics/VoyageBreakdownChart';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

const sample: TCEBreakdown = {
  bunker_usd: 200000,
  canal_usd: 150000,
  da_usd: 50000,
  war_risk_usd: 10000,
  ets_eur: 30000,
  ets_usd: 32400,
  gross_freight_usd: 800000,
  total_costs_usd: 442400,
  net_voyage_usd: 357600,
  daily_tce_usd: 17880,
  applicable: { bunker: true, canal: true, da: true, war_risk: true, ets: true },
};

describe('VoyageBreakdownChart', () => {
  it('renders all cost segments and totals', () => {
    render(<VoyageBreakdownChart breakdown={sample} />);
    expect({
      hasChart: !!screen.getByTestId('voyage-breakdown-chart'),
      hasBunkerSeg: !!screen.getByTestId('segment-bunker_usd'),
      hasCanalSeg: !!screen.getByTestId('segment-canal_usd'),
      showsDailyTce: screen.getByText(/17,880/).textContent !== null,
    }).toEqual({ hasChart: true, hasBunkerSeg: true, hasCanalSeg: true, showsDailyTce: true });
  });

  it('headline Daily TCE reads breakdown.daily_tce_usd (live), not a stored canonical', () => {
    // Phase B(b) #819: drop the stored-vs-live dual-source so the headline and
    // Net Voyage share one truth. Passing a stale "canonical" must not override
    // the live engine's per-day figure.
    render(<VoyageBreakdownChart breakdown={sample} canonicalTceUsdPerDay={99999} />);
    expect(screen.getByText(/17,880/).textContent).not.toBeNull();
    expect(screen.queryByText(/99,999/)).toBeNull();
  });

  it('headline negative when live Net Voyage is negative (sign-convergence guard)', () => {
    const lossSample: TCEBreakdown = {
      ...sample,
      gross_freight_usd: 100000,
      total_costs_usd: 442400,
      net_voyage_usd: -342400,
      daily_tce_usd: -17120,
    };
    // Even if a stale stored canonical says +$21,066/day, the headline must reflect the live loss.
    render(<VoyageBreakdownChart breakdown={lossSample} canonicalTceUsdPerDay={21066} />);
    expect(screen.getByText(/-\$17,120/).textContent).not.toBeNull();
    expect(screen.queryByText(/\$21,066/)).toBeNull();
  });
});
