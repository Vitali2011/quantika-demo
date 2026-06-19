/**
 * test-skill adversarial review — wave-a-phantom-features (HEAD 534e72a5)
 * Class: env-parity + derived-value (totalCosts / dailyTce) — audit A.5 FuelEU.
 *
 * Attacks:
 *  1. BIT-IDENTITY (sanctioned §3): with FUELEU_ENABLED unset/false, every numeric
 *     field of the new computeTce must equal the main-version computeTce
 *     (extracted verbatim from merge-base 40966379) across an input matrix.
 *  2. Flag-string strictness: only the literal 'true' enables the cost line.
 *  3. Share rule edges: one-EU-end (incl. originEu-only, destEu undefined) = half
 *     of intra-EU before rounding.
 *  4. Compliant fuel (lng) → zero penalty, never negative.
 *  5. Unknown fuelType inside the enabled branch → calculateFuelEu throws and
 *     computeTce propagates (latent crash path — no producer sets fuelType today).
 */

import { computeTce } from '@/lib/economics/compute-tce';
import type { TceInputs } from '@/lib/economics/compute-tce';
 
const oldTce = require('./wave-a-fixtures/compute-tce-main-40966379');

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

// Input matrix exercising EU/non-EU, ETS interplay, war-risk routes, zero edges.
const MATRIX: Array<{ name: string; inputs: TceInputs }> = [
  { name: 'eu-dest baseline', inputs: BASE },
  { name: 'intra-eu', inputs: { ...BASE, originEu: true } },
  { name: 'non-eu', inputs: { ...BASE, destEu: false } },
  { name: 'eu + ets price', inputs: { ...BASE, originEu: true, euaPriceEur: 80, euLegPercent: 100 } },
  { name: 'war-risk route', inputs: { ...BASE, originPort: 'Odesa', destinationPort: 'Alexandria' } },
  { name: 'zero consumption', inputs: { ...BASE, consumptionMtPerDay: 0 } },
  { name: 'zero duration', inputs: { ...BASE, overrideDurationDays: 0 } },
  { name: 'exclude-war-risk branch', inputs: { ...BASE, excludeWarRiskFromDailyTce: true, originPort: 'Odesa', destinationPort: 'Alexandria' } },
  { name: 'odd numbers (rounding)', inputs: { ...BASE, consumptionMtPerDay: 17.3, overrideDurationDays: 13.7, quantityMt: 9_751, freightRateUsdPerMt: 15.17 } },
];

const ORIGINAL = process.env.FUELEU_ENABLED;
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.FUELEU_ENABLED;
  else process.env.FUELEU_ENABLED = ORIGINAL;
});
beforeEach(() => {
  delete process.env.FUELEU_ENABLED;
});

describe('A.5 bit-identity with flag off (vs main@40966379)', () => {
  for (const { name, inputs } of MATRIX) {
    it(`flag unset → identical numerics [${name}]`, () => {
      const next = computeTce(inputs);
      const prev = oldTce.computeTce(inputs);
      // Old breakdown lacks fueleu + commission keys; new adds exactly those.
      // commission_pct/commission_usd/net_freight_usd added by PR #1046 — test inputs
      // carry no commissionPct so all three are zero-value no-ops vs the fixture.
      const nb: Record<string, unknown> = { ...next.breakdown };
      const pb: Record<string, unknown> = { ...prev.breakdown };
      expect(nb.fueleu_usd).toBe(0);
      delete nb.fueleu_usd;
      // PR #1046: commission fields with commPct=0 are no-ops vs old fixture
      expect(nb.commission_pct).toBe(0);
      expect(nb.commission_usd).toBe(0);
      expect(nb.net_freight_usd).toBe(nb.gross_freight_usd);
      delete nb.commission_pct;
      delete nb.commission_usd;
      delete nb.net_freight_usd;
      const nApp = { ...(nb.applicable as Record<string, unknown>) };
      expect(nApp.fueleu).toBe(false);
      delete nApp.fueleu;
      nb.applicable = nApp;
      expect(nb).toEqual(pb);
      expect(next.tceUsdPerDay).toBe(prev.tceUsdPerDay);
    });

    it(`flag 'false' → identical numerics [${name}]`, () => {
      process.env.FUELEU_ENABLED = 'false';
      const next = computeTce(inputs);
      const prev = oldTce.computeTce(inputs);
      expect(next.breakdown.fueleu_usd).toBe(0);
      expect(next.breakdown.total_costs_usd).toBe(prev.breakdown.total_costs_usd);
      expect(next.breakdown.daily_tce_usd).toBe(prev.breakdown.daily_tce_usd);
    });
  }

  it("flag strictness: 'TRUE', '1', ' true ' do NOT enable", () => {
    for (const v of ['TRUE', '1', ' true ', 'yes']) {
      process.env.FUELEU_ENABLED = v;
      expect(computeTce(BASE).breakdown.fueleu_usd).toBe(0);
    }
  });
});

describe('A.5 share rule + sign', () => {
  beforeEach(() => {
    process.env.FUELEU_ENABLED = 'true';
  });

  it('originEu-only (destEu undefined) gets the half share, not full', () => {
    const oneEndOrigin = computeTce({ ...BASE, destEu: undefined, originEu: true }).breakdown;
    const intra = computeTce({ ...BASE, originEu: true }).breakdown; // destEu true from BASE
    expect(oneEndOrigin.fueleu_usd).toBeGreaterThan(0);
    expect(oneEndOrigin.fueleu_usd).toBeLessThan(intra.fueleu_usd);
    // half-share within rounding of 1 USD
    expect(Math.abs(intra.fueleu_usd / 2 - oneEndOrigin.fueleu_usd)).toBeLessThanOrEqual(1);
  });

  it('originEu true + destEu false === originEu-only share', () => {
    const a = computeTce({ ...BASE, destEu: false, originEu: true }).breakdown.fueleu_usd;
    const b = computeTce({ ...BASE, destEu: undefined, originEu: true }).breakdown.fueleu_usd;
    expect(a).toBe(b);
  });

  it('penalty is never negative for a compliant fuel (lng under target)', () => {
    const b = computeTce({ ...BASE, fuelType: 'lng' }).breakdown;
    expect(b.fueleu_usd).toBeGreaterThanOrEqual(0);
    // compliant → no penalty → tile/cost line must stay dark
    expect(b.fueleu_usd).toBe(0);
    expect(b.applicable.fueleu).toBe(false);
    expect(b.total_costs_usd).toBe(
      b.bunker_usd + b.canal_usd + b.da_usd + b.war_risk_usd + b.ets_usd,
    );
  });

  it('penalty monotonic in consumption (more burn → ≥ penalty)', () => {
    const lo = computeTce({ ...BASE, consumptionMtPerDay: 20 }).breakdown.fueleu_usd;
    const hi = computeTce({ ...BASE, consumptionMtPerDay: 60 }).breakdown.fueleu_usd;
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi).toBeGreaterThan(0);
  });
});

describe('A.5 unknown fuelType inside enabled branch', () => {
  // FLIPPED 2026-06-12 (QA F-002 fix): unknown fuelType no longer crashes the
  // TCE computation — it falls back to vlsfo and still produces a penalty.
  it('computeTce falls back to vlsfo when flag on + EU leg + garbage fuelType', () => {
    process.env.FUELEU_ENABLED = 'true';
    const garbage = computeTce({ ...BASE, fuelType: 'lsmgo-0.1' });
    const vlsfo = computeTce({ ...BASE, fuelType: 'vlsfo' });
    expect(garbage.breakdown.fueleu_usd).toBe(vlsfo.breakdown.fueleu_usd);
    expect(garbage.breakdown.fueleu_usd).toBeGreaterThan(0);
    // and with the flag OFF the same garbage input is harmless (branch not entered)
    delete process.env.FUELEU_ENABLED;
    expect(() => computeTce({ ...BASE, fuelType: 'lsmgo-0.1' })).not.toThrow();
  });
});
