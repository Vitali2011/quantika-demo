import { withinTolerance } from './tolerance';

it('exact tolerance: only equal passes', () => {
  expect(withinTolerance(50000, { value: 50000, toleranceAbs: 0 })).toBe(true);
  expect(withinTolerance(50001, { value: 50000, toleranceAbs: 0 })).toBe(false);
});

it('pct tolerance: ±3% band', () => {
  expect(withinTolerance(9200, { value: 9000, tolerancePct: 3 })).toBe(true);   // +2.2%
  expect(withinTolerance(9300, { value: 9000, tolerancePct: 3 })).toBe(false);  // +3.3%
});

it('abs-or-pct: passes if within EITHER (whichever larger)', () => {
  // value 12000, ±500 abs OR ±5% (=600). Larger band = 600.
  expect(withinTolerance(12550, { value: 12000, toleranceAbs: 500, tolerancePct: 5 })).toBe(true);
  expect(withinTolerance(12650, { value: 12000, toleranceAbs: 500, tolerancePct: 5 })).toBe(false);
});

it('handles negative expected (loss-maker TCE)', () => {
  expect(withinTolerance(-1180, { value: -1200, toleranceAbs: 500, tolerancePct: 5 })).toBe(true);
});
