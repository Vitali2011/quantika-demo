// W1-4: freshness must use demoNow() (frozen clock), not real Date.now().
// Freeze the demo clock at 2026-05-28 so age is measured against it.
jest.mock('../../clock', () => ({
  demoNow: () => new Date('2026-05-28T12:00:00.000Z').getTime(),
}));

import { deriveTier } from '../derive';

test('deriveTier: static-seed with asOf 30 days ago and staleAfterDays:14 → stale', () => {
  expect(deriveTier({ source: 'static-seed', asOf: '2026-05-09', staleAfterDays: 14 })).toBe('stale');
});

test('deriveTier: source=estimated with no verifiedSources → estimated', () => {
  expect(deriveTier({ source: 'estimated' })).toBe('estimated');
});

test('deriveTier: source=eex in verifiedSources → live', () => {
  expect(deriveTier({ source: 'eex', verifiedSources: ['eex'] })).toBe('live');
});

test('deriveTier: stale check wins over verified source when asOf is old', () => {
  expect(deriveTier({ source: 'eex', verifiedSources: ['eex'], asOf: '2026-05-01', staleAfterDays: 7 })).toBe('stale');
});

test('deriveTier: no source no asOf → live', () => {
  expect(deriveTier({})).toBe('live');
});

// W1-4: age must be measured against the frozen demo clock (2026-05-28),
// not real wall-clock — otherwise seed data drifts to "stale" as real days pass.
test('ageInDays uses demoNow not Date.now — war-risk badge stays live at 77 days', () => {
  // frozen 2026-05-28, asOf 2026-03-12 = 77 days, staleAfterDays 90 → live
  expect(deriveTier({ asOf: '2026-03-12', staleAfterDays: 90 })).toBe('live');
});

test('ageInDays uses demoNow — stale when age exceeds threshold vs frozen clock', () => {
  // frozen 2026-05-28, asOf 2026-02-01 = 116 days > 90 → stale
  expect(deriveTier({ asOf: '2026-02-01', staleAfterDays: 90 })).toBe('stale');
});
