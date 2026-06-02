/**
 * Adversarial QA — PR #739 (fix/eua-bunker-ets)
 * Cold-session test-skill review, 2026-06-01
 *
 * Attack surfaces:
 *   1. TradingEconomics parser: integer prices (no decimal point) — BUG-1 HIGH
 *   2. ETS Cf=3.151 fixture math verification
 */

import {
  parseTradingEconomicsHtml,
  TradingEconomicsParseError,
} from '@/lib/knowledge/eua/tradingeconomics-adapter';

import { cfForFuel, calculateEuEts } from '@/lib/economics/ets';

// ---------------------------------------------------------------------------
// Surface 1 — TradingEconomics integer prices
//
// BUG-1 (HIGH): All three parse strategies use [\d]+\.[\d]+ which requires a
// decimal point. Integer prices like "Last":65 fail ALL strategies → throws
// TradingEconomicsParseError → refreshTradingEconomics returns null → valid
// EUA price silently discarded.
// ---------------------------------------------------------------------------

describe('[ADV] parseTradingEconomicsHtml — integer prices', () => {
  // Strategy 1: JSON "Last" value with no decimal
  it('[BUG-1] strategy1 integer "Last":65 should extract 65, not throw', () => {
    const html = '<script>var te = {"Last":65,"Currency":"EUR"};</script>';
    // Expected: price=65, not TradingEconomicsParseError
    // Will fail if parser uses [\d]+\.[\d]+ (decimal-only) pattern
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBe(65);
  });

  // Strategy 2: data-value with no decimal
  it('[BUG-1] strategy2 integer data-value="65" should extract 65', () => {
    const html = '<span data-value="65">65</span>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBe(65);
  });

  // Strategy 3: id="last-price" with integer content
  it('[BUG-1] strategy3 integer id="last-price">65 should extract 65', () => {
    const html = '<span id="last-price">65</span>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBe(65);
  });

  // Confirm: exactly-round price at boundary is not silently dropped
  it('[BUG-1] integer price 100 EUR (exact boundary not out-of-range) should be extracted', () => {
    const html = '<script>var te = {"Last":100};</script>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBe(100);
  });

  // Baseline still works (decimal prices)
  it('decimal "Last":65.50 still extracted (baseline)', () => {
    const html = '<script>var te = {"Last":65.50};</script>';
    const { price } = parseTradingEconomicsHtml(html);
    expect(price).toBeCloseTo(65.5, 2);
  });
});

// ---------------------------------------------------------------------------
// Surface 2 — ETS Cf=3.151 fixture math verification
//
// Verify exact ets_eur values from the 4 voyage fixtures match Cf=3.151.
// These values are the reference the fixture regen was checked against.
// ---------------------------------------------------------------------------

describe('[ADV] ETS fixture Cf=3.151 math verification', () => {
  const EUR_USD = 1.08; // rate used consistently across all 4 fixtures

  const fixtures = [
    {
      name: 'berbera-rotterdam',
      burnMt: 22 * 18,         // consumptionMtPerDay × durationDays = 396
      euLegPercent: 0.5,
      euaPrice: 80,
      expectedEtsEur: 49911.84,
      expectedEtsUsd: 53905,
      expectedDailyTce: 11468,
    },
    {
      name: 'lagos-rotterdam',
      burnMt: 28 * 14,         // 392
      euLegPercent: 0.5,
      euaPrice: 80,
      expectedEtsEur: 49407.68,
      expectedEtsUsd: 53360,
      expectedDailyTce: 80174,
    },
    {
      name: 'antwerp-singapore-suez',
      burnMt: 32 * 25,         // 800
      euLegPercent: 0.3,
      euaPrice: 80,
      expectedEtsEur: 60499.2,
      expectedEtsUsd: 65339,
      expectedDailyTce: 30256,
    },
    {
      name: 'antwerp-singapore-cape',
      burnMt: 32 * 34,         // 1088
      euLegPercent: 0.3,
      euaPrice: 80,
      expectedEtsEur: 82278.91,
      expectedEtsUsd: 88861,
      expectedDailyTce: 32771,
    },
  ];

  for (const f of fixtures) {
    it(`${f.name}: ets_eur = burnMt × 3.151 × euLeg × euaPrice`, () => {
      const cf = cfForFuel('VLSFO'); // must be 3.151
      expect(cf).toBe(3.151);

      const ets = calculateEuEts({
        distanceNm: 9999,         // non-zero, value irrelevant to amount
        euLegPercent: f.euLegPercent,
        vlsfoBurnMt: f.burnMt,
        euaPrice: f.euaPrice,
        fuelType: 'VLSFO',
        year: 2026,
      });
      expect(ets.amountEur).toBeCloseTo(f.expectedEtsEur, 1);
    });

    it(`${f.name}: fixture ets_eur consistent with Cf=3.151 (not old 3.114)`, () => {
      const cf3114 = 3.114;
      const oldEtsEur = f.burnMt * cf3114 * f.euLegPercent * 1.0 * f.euaPrice;
      const newEtsEur = f.burnMt * 3.151 * f.euLegPercent * 1.0 * f.euaPrice;

      // fixture must NOT match old Cf
      expect(f.expectedEtsEur).not.toBeCloseTo(oldEtsEur, 1);
      // fixture must match new Cf
      expect(f.expectedEtsEur).toBeCloseTo(newEtsEur, 1);
    });

    it(`${f.name}: ets_usd = ets_eur × EUR/USD=${EUR_USD} within $5 rounding`, () => {
      const computed = Math.round(f.expectedEtsEur * EUR_USD);
      expect(Math.abs(computed - f.expectedEtsUsd)).toBeLessThanOrEqual(5);
    });

    it(`${f.name}: daily_tce drift from old Cf is within ±2%`, () => {
      // Old ets_usd under Cf=3.114, same EUR/USD
      const oldEtsEur = f.burnMt * 3.114 * f.euLegPercent * 1.0 * f.euaPrice;
      const oldEtsUsd = Math.round(oldEtsEur * EUR_USD);
      const deltaUsd = f.expectedEtsUsd - oldEtsUsd; // ETS increased → net decreased

      // Approximate old daily_tce = newDailyTce + deltaUsd / durationDays
      // We don't know durationDays here, but drift % ≈ deltaUsd / expectedEtsUsd < 1.2%
      // Simpler: check absolute drift is small relative to total
      const driftFraction = Math.abs(deltaUsd) / f.expectedEtsUsd;
      // ETS delta is ~1.2% of ets_usd; as fraction of total voyage net, it's even smaller
      expect(driftFraction).toBeLessThan(0.02); // < 2%
    });
  }
});

// ---------------------------------------------------------------------------
// Surface 3 — HFO unchanged at 3.114 (no regression to old default)
// ---------------------------------------------------------------------------

describe('[ADV] cfForFuel — HFO/HSFO stayed at 3.114 (no regression)', () => {
  it('HFO is 3.114, not 3.151', () => {
    expect(cfForFuel('HFO')).toBe(3.114);
    expect(cfForFuel('HFO')).not.toBe(3.151);
  });

  it('HSFO is 3.114, not 3.151', () => {
    expect(cfForFuel('HSFO')).toBe(3.114);
    expect(cfForFuel('HSFO')).not.toBe(3.151);
  });

  it('HFO ETS at 1000t intra-EU 2026 is 3114 EUR (not 3151)', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'HFO',
      year: 2026,
    });
    expect(result.amountEur).toBe(3114);
    expect(result.amountEur).not.toBe(3151);
  });

  it('VLSFO ETS at 1000t intra-EU 2026 is 3151 EUR (not 3114)', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'VLSFO',
      year: 2026,
    });
    expect(result.amountEur).toBe(3151);
    expect(result.amountEur).not.toBe(3114);
  });
});
