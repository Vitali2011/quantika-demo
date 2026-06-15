import { demotionReason } from '@/lib/sailing/match-scoring';

describe('demotionReason', () => {
  const ballast = 'BALLAST: 5400nm exceeds panamax ballast radius 3000nm — uneconomic, capped to possible';
  const size = 'SIZE: cargo fills only 38% of vessel (deadfreight) — disproportion, capped to possible';

  it('returns the ballast reason when a high-fit match was demoted below "good"', () => {
    // fit 87% would derive "good", but ballast cap demoted it to "possible".
    expect(demotionReason(87, 'possible', [ballast])).toBe(
      '5400nm exceeds panamax ballast radius 3000nm — uneconomic, capped to possible',
    );
  });

  it('returns the size reason when present', () => {
    expect(demotionReason(82, 'possible', ['Some unrelated note', size])).toBe(
      'cargo fills only 38% of vessel (deadfreight) — disproportion, capped to possible',
    );
  });

  it('returns null when the level matches what the fit implies (no demotion)', () => {
    // fit 87% → "good" and matchLevel is "good": nothing was demoted.
    expect(demotionReason(87, 'good', [ballast])).toBeNull();
  });

  it('returns null when there is no cap issue to explain the demotion', () => {
    expect(demotionReason(87, 'possible', ['Sanctions: medium risk'])).toBeNull();
  });

  it('returns null when fitPercent is null/undefined', () => {
    expect(demotionReason(null, 'possible', [ballast])).toBeNull();
    expect(demotionReason(undefined, 'possible', [ballast])).toBeNull();
  });
});
