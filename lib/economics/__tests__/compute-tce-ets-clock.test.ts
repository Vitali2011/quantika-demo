/**
 * EU ETS phase-in must be anchored to the app clock (lib/clock `now`), NOT the
 * raw wall-clock — audit finding #6.
 *
 * Before the fix, computeTce called calculateEuEts without a year, so the pure
 * calc fell back to `new Date().getFullYear()`. That made a "deterministic"
 * voyage P&L depend on when it ran: the same match computed in Dec 2025 vs
 * Jan 2026 produced different ETS (phase-in 0.7 → 1.0, +43%), and demo-mode's
 * frozen clock was ignored.
 *
 * These tests mock `@/lib/clock` so the phase-in year is fully injected.
 */

jest.mock('@/lib/clock', () => ({ now: jest.fn() }));

import { now } from '@/lib/clock';
import { computeTce } from '../compute-tce';
import type { TceInputs } from '../compute-tce';

const mockNow = now as jest.MockedFunction<typeof now>;

// Intra-EU voyage with a real EUA price so ETS is non-zero and phase-in matters.
const BASE: TceInputs = {
  dwt: 15_000,
  valueUsd: 8_000_000,
  speedKts: 12,
  consumptionMtPerDay: 50,
  distanceNm: 1_000,
  quantityMt: 9_750,
  freightRateUsdPerMt: 15,
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 80,
  canalUsd: 0,
  daUsd: 0,
  overrideDurationDays: 20,
  euLegPercent: 1.0,
  originEu: true,
  destEu: true,
};

describe('computeTce EU ETS — clock-anchored phase-in (audit #6)', () => {
  it('phase-in tracks the injected clock year, not the wall-clock', () => {
    mockNow.mockReturnValue(new Date('2025-06-15T00:00:00.000Z'));
    const ets2025 = computeTce(BASE).breakdown.ets_eur;

    mockNow.mockReturnValue(new Date('2027-06-15T00:00:00.000Z'));
    const ets2027 = computeTce(BASE).breakdown.ets_eur;

    // phaseIn 2025 = 0.7, 2027 = 1.0 → 2025 is exactly 70% of fully-phased.
    expect(ets2025).toBeGreaterThan(0);
    expect(ets2025).toBeLessThan(ets2027);
    expect(ets2025).toBeCloseTo(ets2027 * 0.7, 2);
  });

  it('same inputs + same frozen year → identical ETS regardless of month (Dec vs Jan)', () => {
    mockNow.mockReturnValue(new Date('2025-12-31T00:00:00.000Z'));
    const december = computeTce(BASE).breakdown.ets_eur;

    mockNow.mockReturnValue(new Date('2025-01-01T00:00:00.000Z'));
    const january = computeTce(BASE).breakdown.ets_eur;

    expect(december).toBe(january);
  });
});
