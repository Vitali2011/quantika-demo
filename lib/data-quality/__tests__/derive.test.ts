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
