/**
 * U5 / #679 — Laytime → Demurrage/Despatch MONEY-SIGN integration guard.
 *
 * Audit finding (COVERAGE_GAP, high): "calculator.ts portHolidays +
 * weatherDelayHours directly subtract from used laytime and swing
 * demurrage/despatch money. A sign error or off-by-one in charterparty D/D money
 * calc would be invisible."
 *
 * The existing lib/__tests__/laytime-calculator.test.ts proves portHolidays and
 * weatherDelayHours move usedLaytimeHours (and are mutation-honest about it). The
 * gap that remained: no test runs the FULL pipeline calculateLaytime ->
 * calculateDemurrageDespatch and asserts that those exclusions FLIP the money
 * SIGN (charterer-pays demurrage vs. owner-pays despatch) and produce the correct
 * dollar figure. A sign error in the deduction would silently invert who owes
 * whom thousands of USD.
 *
 * Both SUTs are the REAL functions — nothing is mocked. Mutation contract is
 * documented per-assertion; verified in the U5 report.
 */

import { calculateLaytime } from '../laytime/calculator';
import { calculateDemurrageDespatch } from '../laytime/dd-calculator';
import type { LaytimeInput } from '../types';

const DEMURRAGE_RATE = 8000; // USD/day
const DESPATCH_RATE = 4000; // USD/day (half demurrage, the dd-calculator default)

describe('laytime → D/D money sign: portHolidays flips demurrage → despatch', () => {
  // Window: 6 full SHEX days (May 11 Mon … May 16 Sat), 5 days allowed.
  // Without holidays → 6 days used vs 5 allowed → 24h demurrage (charterer PAYS).
  // Add 2 port holidays inside the window → 4 days counted vs 5 allowed →
  //   despatch (owner is PAID). The sign MUST flip.
  const base: LaytimeInput = {
    allowedLaytimeDays: 5,
    mode: 'SHEX',
    commencedAt: '2026-05-11T00:00:00Z', // Monday
    completedAt: '2026-05-17T00:00:00Z', // Sunday (excluded by SHEX) → 6 counted days Mon–Sat
  };

  it('NO holidays → demurrage, charterer pays a positive netAmount', () => {
    const laytime = calculateLaytime(base);
    expect(laytime.demurrageOrDespatch).toBe('demurrage');
    const money = calculateDemurrageDespatch({
      laytimeResult: laytime,
      demurrageRateUsdPerDay: DEMURRAGE_RATE,
      despatchRateUsdPerDay: DESPATCH_RATE,
    });
    expect(money.status).toBe('demurrage');
    // netHours ≈ +24 → 1 day demurrage → +$8000 owed by charterer.
    expect(money.netAmount).toBeCloseTo(DEMURRAGE_RATE, 0);
    expect(money.netAmount).toBeGreaterThan(0);
    expect(money.despatchAmount).toBe(0);
  });

  it('TWO port holidays inside the window → despatch, owner is paid (negative netAmount)', () => {
    const withHolidays: LaytimeInput = {
      ...base,
      portHolidays: ['2026-05-13', '2026-05-14'], // Wed + Thu inside the window
    };
    const laytime = calculateLaytime(withHolidays);
    // 6 counted days minus 2 holidays = 4 days used vs 5 allowed.
    expect(laytime.usedLaytimeHours).toBeCloseTo(4 * 24, 1);
    expect(laytime.demurrageOrDespatch).toBe('despatch');

    const money = calculateDemurrageDespatch({
      laytimeResult: laytime,
      demurrageRateUsdPerDay: DEMURRAGE_RATE,
      despatchRateUsdPerDay: DESPATCH_RATE,
    });
    expect(money.status).toBe('despatch');
    // netHours ≈ -24 → 1 day despatch at $4000 → netAmount = -$4000 (owner earns).
    expect(money.netAmount).toBeCloseTo(-DESPATCH_RATE, 0);
    expect(money.netAmount).toBeLessThan(0);
    expect(money.demurrageAmount).toBe(0);
  });
});

describe('laytime → D/D money sign: weatherDelayHours flips demurrage → despatch dollars', () => {
  // 6 SHINC days used vs 5 allowed → 24h demurrage = $8000 owed by charterer.
  // 36h weather delay deducted → 4.5 days used vs 5 allowed → 12h DESPATCH.
  // A SIGN error (ADDING weather delay instead of subtracting) would push to 60h
  // demurrage → +$20000 the WRONG WAY. This asserts the dollar sign + magnitude.
  const base: LaytimeInput = {
    allowedLaytimeDays: 5,
    mode: 'SHINC',
    commencedAt: '2026-05-12T00:00:00Z',
    completedAt: '2026-05-18T00:00:00Z', // 6 days
  };

  it('without weather delay → 24h demurrage = $8000 (charterer pays)', () => {
    const laytime = calculateLaytime(base);
    const money = calculateDemurrageDespatch({
      laytimeResult: laytime,
      demurrageRateUsdPerDay: DEMURRAGE_RATE,
    });
    expect(money.status).toBe('demurrage');
    expect(money.demurrageAmount).toBeCloseTo(DEMURRAGE_RATE, 0); // 1 day × $8000
    expect(money.netAmount).toBeGreaterThan(0);
  });

  it('36h weather delay flips to despatch — owner earns $2000 (proves SUBTRACTION, not addition)', () => {
    const laytime = calculateLaytime({ ...base, weatherDelayHours: 36 });
    expect(laytime.usedLaytimeHours).toBeCloseTo(4.5 * 24, 1); // 6 days − 36h = 4.5 days
    expect(laytime.demurrageOrDespatch).toBe('despatch');
    const money = calculateDemurrageDespatch({
      laytimeResult: laytime,
      demurrageRateUsdPerDay: DEMURRAGE_RATE,
      despatchRateUsdPerDay: DESPATCH_RATE,
    });
    expect(money.status).toBe('despatch');
    // 12h despatch at $4000/day = $2000 earned by owner → negative netAmount.
    expect(money.despatchAmount).toBeCloseTo((12 / 24) * DESPATCH_RATE, 0); // $2000
    expect(money.netAmount).toBeCloseTo(-((12 / 24) * DESPATCH_RATE), 0);
    expect(money.netAmount).toBeLessThan(0);
    expect(money.demurrageAmount).toBe(0);
  });
});
