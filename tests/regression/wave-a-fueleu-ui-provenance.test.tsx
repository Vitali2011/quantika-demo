/**
 * @jest-environment jsdom
 *
 * test-skill adversarial review — wave-a-phantom-features (HEAD 534e72a5)
 * Class: displayed-value-provenance + conditional-ui-liveness — audit A.5 tile/row.
 *
 * Attacks:
 *  1. LEGACY persisted breakdown (worksheet_json written before this branch) has
 *     NO fueleu_usd key. CalculationWaterfall destructures it — must not crash,
 *     must not render the FuelEU row, must keep total/net/TCE rows intact.
 *  2. fueleu_usd > 0 → row renders, bound to breakdown.fueleu_usd exactly
 *     (negative-formatted), and the displayed total equals breakdown.total_costs_usd
 *     which already INCLUDES fueleu (compute-time aggregation).
 *  3. fueleu_usd = 0 (flag off / non-EU) → no row (no "$0" noise).
 *  4. EconomicsTab source binding: tile gated on voyageBreakdown.fueleu_usd > 0,
 *     value bound to the SAME field, and no NEXT_PUBLIC_FUELEU read in the component
 *     (plan T5 Step 6: tile is data-driven; bake-time env must not gate it).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CalculationWaterfall } from '@/components/economics/CalculationWaterfall';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

const MODERN: TCEBreakdown = {
  freight_rate_usd_per_mt: 30,
  quantity_mt: 50_000,
  duration_days: 20,
  bunker_consumption_mt_per_day: 28,
  bunker_price_usd_per_mt: 550,
  gross_freight_usd: 1_500_000,
  bunker_usd: 308_000,
  canal_usd: 0,
  da_usd: 60_000,
  war_risk_usd: 13_500,
  ets_eur: 2000,
  ets_usd: 2160,
  fueleu_usd: 7_345,
  total_costs_usd: 391_005, // includes fueleu (compute-time)
  net_voyage_usd: 1_108_995,
  daily_tce_usd: 55_450,
  applicable: { bunker: true, canal: false, da: true, war_risk: true, ets: false, fueleu: true },
};

// Legacy shape: persisted before A.5 — fueleu keys absent entirely.
const LEGACY = (() => {
  const b: Record<string, unknown> = { ...MODERN, total_costs_usd: 383_660, net_voyage_usd: 1_116_340 };
  delete b.fueleu_usd;
  const app = { ...(MODERN.applicable as Record<string, unknown>) };
  delete app.fueleu;
  b.applicable = app;
  return b as unknown as TCEBreakdown;
})();

describe('A.5 CalculationWaterfall — legacy persisted breakdown (no fueleu_usd key)', () => {
  it('renders without crash, no FuelEU row, totals intact', () => {
    render(<CalculationWaterfall breakdown={LEGACY} />);
    expect(screen.queryByTestId('cost-fueleu')).not.toBeInTheDocument();
    expect(screen.getByText('= Total costs')).toBeInTheDocument();
    expect(screen.getByTestId('net-voyage')).toHaveTextContent('1,116,340');
    // no NaN anywhere in the document
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});

describe('A.5 CalculationWaterfall — fueleu_usd binding', () => {
  it('positive fueleu_usd renders its own negative-formatted row', () => {
    render(<CalculationWaterfall breakdown={MODERN} />);
    const row = screen.getByTestId('cost-fueleu');
    expect(row).toHaveTextContent('FuelEU Maritime');
    expect(row).toHaveTextContent('-$7,345');
  });

  it('displayed total binds breakdown.total_costs_usd (fueleu included upstream, not re-added in UI)', () => {
    const { container } = render(<CalculationWaterfall breakdown={MODERN} />);
    // total row shows -$391,005 exactly once (no double-count rendering)
    const text = container.textContent ?? '';
    expect(text).toContain('-$391,005');
    expect(text.split('-$391,005').length - 1).toBe(1);
  });

  it('fueleu_usd === 0 → row absent (no $0 noise)', () => {
    render(<CalculationWaterfall breakdown={{ ...MODERN, fueleu_usd: 0, total_costs_usd: 383_660 }} />);
    expect(screen.queryByTestId('cost-fueleu')).not.toBeInTheDocument();
  });
});

describe('A.5 EconomicsTab — source binding (tile is data-driven, not env-gated)', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'components/match/EconomicsTab.tsx'),
    'utf8',
  );

  it('tile gate + value both bind voyageBreakdown.fueleu_usd', () => {
    expect(src).toMatch(/voyageBreakdown\.fueleu_usd > 0/);
    expect(src).toMatch(/data-testid="fueleu-usd"/);
    expect(src).toMatch(/\$\{voyageBreakdown\.fueleu_usd\.toLocaleString\('en-US'\)\}/);
  });

  it('no client env read gates the tile (NEXT_PUBLIC_FUELEU absent from component)', () => {
    expect(src).not.toMatch(/NEXT_PUBLIC_FUELEU/);
    expect(src).not.toMatch(/process\.env\.FUELEU/);
  });

  it('feed is live: the TCE fetch passes includeEuETS: true (route sets originEu/destEu only then)', () => {
    expect(src).toMatch(/includeEuETS:\s*true/);
  });
});
