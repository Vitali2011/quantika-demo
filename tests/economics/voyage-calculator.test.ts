/**
 * β-05 Voyage Calculator (TCE) — fixture-driven correctness tests.
 *
 * Discipline: max 2-3 expects per fixture, single object equality preferred
 * over many micro-asserts (pipeline guard caps spec at ≤50 expects).
 */

import fs from 'fs';
import path from 'path';
import { calculateTCE, type VoyageInput } from '@/lib/economics/voyage-calculator';

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'voyage-tce');

interface Fixture {
  input: VoyageInput;
  expected: {
    bunker_usd: number;
    canal_usd: number;
    da_usd: number;
    war_risk_usd: number;
    ets_eur: number;
    ets_usd: number;
    gross_freight_usd: number;
    total_costs_usd: number;
    net_voyage_usd: number;
    daily_tce_usd: number;
  };
}

function loadFixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

const FIXTURES = [
  'berbera-rotterdam.json',
  'lagos-rotterdam.json',
  'antwerp-singapore-suez.json',
  'antwerp-singapore-cape.json',
  'houston-tianjin.json',
];

describe('calculateTCE — fixtures', () => {
  it.each(FIXTURES)('matches reference within ±2%% — %s', (name) => {
    const { input, expected } = loadFixture(name);
    const { breakdown, daily_tce_usd } = calculateTCE(input);

    // single object check (1 expect): all 10 numeric fields
    expect({
      bunker_usd: breakdown.bunker_usd,
      canal_usd: breakdown.canal_usd,
      da_usd: breakdown.da_usd,
      war_risk_usd: breakdown.war_risk_usd,
      ets_eur: breakdown.ets_eur,
      ets_usd: breakdown.ets_usd,
      gross_freight_usd: breakdown.gross_freight_usd,
      total_costs_usd: breakdown.total_costs_usd,
      net_voyage_usd: breakdown.net_voyage_usd,
      daily_tce_usd: breakdown.daily_tce_usd,
    }).toEqual(expected);

    // tolerance check (1 expect)
    const drift = Math.abs(daily_tce_usd - expected.daily_tce_usd) / Math.max(1, expected.daily_tce_usd);
    expect(drift).toBeLessThan(0.02);
  });
});

describe('calculateTCE — guards', () => {
  it('NaN inputs collapse to 0 without throwing', () => {
    const result = calculateTCE({
      vessel: { dwt: NaN, valueUsd: NaN, speedKts: NaN, consumptionMtPerDay: NaN },
      route: { originPort: 'x', destinationPort: 'y', distanceNm: NaN },
      cargo: { quantityMt: NaN, freightRateUsdPerMt: NaN },
      bunkerPriceUsdPerMt: NaN,
      euaPriceEur: NaN,
      durationDays: NaN,
    });
    expect(Number.isFinite(result.daily_tce_usd)).toBe(true);
    expect(result.breakdown.applicable.bunker).toBe(false);
  });

  it('durationDays=0 → daily_tce_usd=0 (not Infinity)', () => {
    const result = calculateTCE({
      vessel: { dwt: 50000, valueUsd: 20_000_000, speedKts: 13, consumptionMtPerDay: 25 },
      route: { originPort: 'rotterdam', destinationPort: 'singapore', distanceNm: 8000 },
      cargo: { quantityMt: 30000, freightRateUsdPerMt: 25 },
      bunkerPriceUsdPerMt: 600,
      euaPriceEur: 80,
      durationDays: 0,
    });
    expect(result.daily_tce_usd).toBe(0);
  });
});
