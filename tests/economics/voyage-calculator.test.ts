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

    // single object check (1 expect): all numeric fields present in expected
    const received: Record<string, unknown> = {
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
    };
    if ('commission_pct' in expected) {
      received.commission_pct = breakdown.commission_pct;
      received.commission_usd = breakdown.commission_usd;
      received.net_freight_usd = breakdown.net_freight_usd;
    }
    expect(received).toEqual(expected);

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

describe('calculateTCE — B1 derivation inputs (transparent math)', () => {
  const B1_INPUT: VoyageInput = {
    vessel: { dwt: 55000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 28 },
    route: { originPort: 'rotterdam', destinationPort: 'singapore', distanceNm: 9000 },
    cargo: { quantityMt: 50000, freightRateUsdPerMt: 30 },
    bunkerPriceUsdPerMt: 550,
    euaPriceEur: 65,
    durationDays: 20,
    canalUsd: 0,
    daUsd: 60000,
  };

  it('exposes freight_rate_usd_per_mt and quantity_mt in breakdown', () => {
    const { breakdown } = calculateTCE(B1_INPUT);
    expect(breakdown.freight_rate_usd_per_mt).toBe(30);
    expect(breakdown.quantity_mt).toBe(50000);
  });

  it('gross_freight_usd === quantity_mt * freight_rate_usd_per_mt', () => {
    const { breakdown } = calculateTCE(B1_INPUT);
    expect(breakdown.gross_freight_usd).toBe(breakdown.quantity_mt * breakdown.freight_rate_usd_per_mt);
  });

  it('net_voyage_usd === gross_freight_usd - total_costs_usd', () => {
    const { breakdown } = calculateTCE(B1_INPUT);
    expect(breakdown.net_voyage_usd).toBe(breakdown.gross_freight_usd - breakdown.total_costs_usd);
  });

  it('exposes duration_days in breakdown', () => {
    const { breakdown } = calculateTCE(B1_INPUT);
    expect(breakdown.duration_days).toBe(20);
  });

  it('exposes bunker_consumption_mt_per_day and bunker_price_usd_per_mt', () => {
    const { breakdown } = calculateTCE(B1_INPUT);
    expect(breakdown.bunker_consumption_mt_per_day).toBe(28);
    expect(breakdown.bunker_price_usd_per_mt).toBe(550);
  });
});

describe('calculateTCE — commission deduction (PR #1046)', () => {
  const BASE_INPUT: VoyageInput = {
    vessel: { dwt: 55000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 28 },
    route: { originPort: 'rotterdam', destinationPort: 'singapore', distanceNm: 9000 },
    cargo: { quantityMt: 50000, freightRateUsdPerMt: 30, commissionPct: 3.75 },
    bunkerPriceUsdPerMt: 550,
    euaPriceEur: 65,
    durationDays: 20,
    daUsd: 60000,
  };

  it('commission_usd = round(gross_freight * commPct/100)', () => {
    const { breakdown } = calculateTCE(BASE_INPUT);
    // 50000 * 30 = 1500000; round(1500000 * 0.0375) = 56250
    expect(breakdown.commission_usd).toBe(Math.round(breakdown.gross_freight_usd * 0.0375));
    expect(breakdown.commission_pct).toBe(3.75);
  });

  it('net_voyage_usd = net_freight_usd - total_costs_usd', () => {
    const { breakdown } = calculateTCE(BASE_INPUT);
    expect(breakdown.net_freight_usd).toBe(breakdown.gross_freight_usd - breakdown.commission_usd!);
    expect(breakdown.net_voyage_usd).toBe(breakdown.net_freight_usd! - breakdown.total_costs_usd);
  });

  it('daily_tce_usd lower than no-commission baseline', () => {
    const noComm: VoyageInput = { ...BASE_INPUT, cargo: { ...BASE_INPUT.cargo, commissionPct: undefined } };
    const { daily_tce_usd: withComm } = calculateTCE(BASE_INPUT);
    const { daily_tce_usd: withoutComm } = calculateTCE(noComm);
    expect(withComm).toBeLessThan(withoutComm);
  });
});
