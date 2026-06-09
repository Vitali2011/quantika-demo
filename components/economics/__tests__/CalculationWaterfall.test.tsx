/**
 * @jest-environment jsdom
 *
 * B2 — CalculationWaterfall presentational component tests.
 *
 * Asserts the approved English-label waterfall layout renders correctly:
 *   revenue → each cost line (negative) → net voyage → ÷ days → daily TCE.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalculationWaterfall } from '../CalculationWaterfall';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

const FIXTURE: TCEBreakdown = {
  // derivation inputs (B1)
  freight_rate_usd_per_mt: 30,
  quantity_mt: 50000,
  duration_days: 20,
  bunker_consumption_mt_per_day: 28,
  bunker_price_usd_per_mt: 550,
  // aggregated values
  gross_freight_usd: 1_500_000,
  bunker_usd: 308_000,
  canal_usd: 0,
  da_usd: 60_000,
  war_risk_usd: 13_500,
  ets_eur: 2000,
  ets_usd: 2160,
  total_costs_usd: 383_660,
  net_voyage_usd: 1_116_340,
  daily_tce_usd: 55_817,
  applicable: {
    bunker: true,
    canal: false,
    da: true,
    war_risk: true,
    ets: false,
  },
};

describe('CalculationWaterfall', () => {
  it('shows "Revenue" section with gross_freight_usd', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    expect(screen.getByText(/Revenue per voyage/)).toBeInTheDocument();
    // gross freight formatted as $1,500,000
    expect(screen.getByTestId('gross-freight')).toHaveTextContent('1,500,000');
  });

  it('shows bunker cost row with negative value and consumption/price caption', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const bunkerRow = screen.getByTestId('cost-bunker');
    expect(bunkerRow).toBeInTheDocument();
    // negative format: -$308,000
    expect(bunkerRow).toHaveTextContent('-$308,000');
    // caption contains consumption and price
    const caption = screen.getByTestId('bunker-caption');
    expect(caption.textContent).toMatch(/consumption/);
    expect(caption.textContent).toMatch(/price/);
  });

  it('shows DA cost row with negative value', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const daRow = screen.getByTestId('cost-da');
    expect(daRow).toHaveTextContent('-$60,000');
  });

  it('shows war risk row with "does not affect $/day" caption', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const warRow = screen.getByTestId('cost-war-risk');
    expect(warRow).toBeInTheDocument();
    const caption = screen.getByTestId('war-risk-caption');
    expect(caption.textContent).toMatch(/does not affect/);
  });

  it('shows canal zero-note when canal is 0', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const canalNote = screen.getByTestId('canal-zero-note');
    expect(canalNote).toBeInTheDocument();
  });

  it('shows ETS zero-note when ETS is 0 applicable=false', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const etsNote = screen.getByTestId('ets-zero-note');
    expect(etsNote).toBeInTheDocument();
  });

  it('shows "Чистыми за рейс" with net_voyage_usd', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    expect(screen.getByTestId('net-voyage')).toHaveTextContent('1,116,340');
  });

  it('shows "÷ N days" with duration_days', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const durationRow = screen.getByTestId('duration-days');
    expect(durationRow.textContent).toMatch(/20/);
    expect(durationRow.textContent).toMatch(/days/);
  });

  it('shows "Daily TCE" with daily_tce_usd', () => {
    render(<CalculationWaterfall breakdown={FIXTURE} />);
    const tceRow = screen.getByTestId('daily-tce');
    expect(tceRow).toHaveTextContent('55,817');
  });

  it('shows non-zero canal amount (not zero-note) when canal > 0', () => {
    const withCanal: TCEBreakdown = {
      ...FIXTURE,
      canal_usd: 45000,
      applicable: { ...FIXTURE.applicable, canal: true },
    };
    render(<CalculationWaterfall breakdown={withCanal} />);
    const canalRow = screen.getByTestId('cost-canal');
    expect(canalRow).toHaveTextContent('-$45,000');
    expect(screen.queryByTestId('canal-zero-note')).not.toBeInTheDocument();
  });
});
