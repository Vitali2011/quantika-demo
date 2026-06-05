import { estimateRoundTripDays, estimateVoyageDays } from '@/lib/economics/voyage-days';

describe('estimateRoundTripDays', () => {
  test('round-trip = laden*2 + 2 port days', () => {
    // 400 nm at 12 kn: laden = 1.389 → round-trip = 4.778
    expect(estimateRoundTripDays(400, 12)).toBeCloseTo(4.778, 2);
  });
  test('returns 0 when distance missing (no fake 10-day fallback)', () => {
    expect(estimateRoundTripDays(0, 12)).toBe(0);
    expect(estimateRoundTripDays(null, 12)).toBe(0);
  });
  test('uses 12kn default when speed missing', () => {
    expect(estimateRoundTripDays(288, null)).toBeCloseTo(4, 1); // 288/(12*24)=1, *2+2=4
  });
  test('does not change estimateVoyageDays behavior', () => {
    expect(estimateVoyageDays(400, 12)).toBe(1); // max(1, round(1.389))
  });
});
