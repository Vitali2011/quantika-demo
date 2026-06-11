import { deriveBucketReason } from '@/lib/matching/bucket-reason';

test('unknown verdict → insufficientData', () => {
  expect(deriveBucketReason({ verdict: 'unknown', gapDays: null, matchLevel: 'possible',
    tceUsdPerDay: 9000, vesselDwt: 50000, issues: [] })).toEqual({
      bucket: 'insufficientData',
      reason: 'No distance/timing data — readiness verdict is unknown.',
    });
});

test('idle gap > 21d → lowConfidence', () => {
  expect(deriveBucketReason({ verdict: 'idle', gapDays: 30, matchLevel: 'good',
    tceUsdPerDay: 9000, vesselDwt: 50000, issues: [] }).bucket).toBe('lowConfidence');
});

test('tce below DWT-tiered breakeven → lowConfidence', () => {
  const r = deriveBucketReason({ verdict: 'ideal', gapDays: 1, matchLevel: 'good',
    tceUsdPerDay: 4000, vesselDwt: 50000, issues: [] }); // 40k<dwt≤65k floor = $5,500
  expect(r.bucket).toBe('lowConfidence');
  expect(r.reason).toMatch(/below the \$5,500\/day breakeven/);
});

test('all clear → main', () => {
  expect(deriveBucketReason({ verdict: 'ideal', gapDays: 1, matchLevel: 'good',
    tceUsdPerDay: 12000, vesselDwt: 50000, issues: [] }).bucket).toBe('main');
});
