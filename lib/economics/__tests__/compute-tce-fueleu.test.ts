/**
 * FuelEU Maritime penalty cost line in computeTce (audit A.5).
 *
 * Flag-gated behind FUELEU_ENABLED. Invariant: when the flag is unset
 * (the default in every existing test), behavior is bit-identical to the
 * pre-FuelEU economics — fueleu_usd is 0 and totals exclude it.
 *
 * Scope rule per EU Reg. 2023/1805: 100% of voyage energy counts when both
 * endpoints are EU (intra-EU), 50% when exactly one endpoint is EU.
 */

import { computeTce } from '../compute-tce';
import type { TceInputs } from '../compute-tce';

// Minimal valid inputs copied from the neighbouring golden-set tests (HS-1),
// with an EU destination. consumption=50 / duration=20 chosen so that the
// half-share rounding is exact: round(p) === 2 * round(p/2).
const BASE: TceInputs = {
  dwt: 15_000,
  valueUsd: 8_000_000,
  speedKts: 12,
  consumptionMtPerDay: 50,
  distanceNm: 1_000,
  quantityMt: 9_750,
  freightRateUsdPerMt: 15,
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 0,
  canalUsd: 0,
  daUsd: 0,
  overrideDurationDays: 20,
  destEu: true,
};

const ORIGINAL_FLAG = process.env.FUELEU_ENABLED;

describe('FuelEU penalty line (audit A.5)', () => {
  beforeEach(() => {
    delete process.env.FUELEU_ENABLED;
  });

  afterAll(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.FUELEU_ENABLED;
    } else {
      process.env.FUELEU_ENABLED = ORIGINAL_FLAG;
    }
  });

  it('flag off (default) → fueleu_usd 0, not applicable, totals unchanged', () => {
    const { breakdown: b } = computeTce(BASE);
    expect(b.fueleu_usd).toBe(0);
    expect(b.applicable.fueleu).toBe(false);
    // total_costs must be exactly the legacy sum — no FuelEU contribution
    expect(b.total_costs_usd).toBe(
      b.bunker_usd + b.canal_usd + b.da_usd + b.war_risk_usd + b.ets_usd
    );
  });

  it('flag on + EU leg → positive penalty, enters total_costs', () => {
    process.env.FUELEU_ENABLED = 'true';
    const { breakdown: b } = computeTce(BASE);
    expect(b.fueleu_usd).toBeGreaterThan(0);
    expect(b.applicable.fueleu).toBe(true);
    expect(b.total_costs_usd).toBe(
      b.bunker_usd + b.canal_usd + b.da_usd + b.war_risk_usd + b.ets_usd + b.fueleu_usd
    );
  });

  it('flag on + non-EU voyage → 0', () => {
    process.env.FUELEU_ENABLED = 'true';
    const { breakdown: b } = computeTce({ ...BASE, destEu: false });
    expect(b.fueleu_usd).toBe(0);
    expect(b.applicable.fueleu).toBe(false);
  });

  it('intra-EU counts full energy, one-EU-end counts half (FuelEU scope rule)', () => {
    process.env.FUELEU_ENABLED = 'true';
    const oneEnd = computeTce(BASE).breakdown; // destEu only → 50% share
    const intra = computeTce({ ...BASE, originEu: true }).breakdown; // both ends EU → 100%
    expect(oneEnd.fueleu_usd).toBeGreaterThan(0);
    expect(intra.fueleu_usd).toBe(oneEnd.fueleu_usd * 2);
  });
});
