// W1-4: freshness must be measured against the frozen demo clock, not real
// Date.now(). deriveTier is clock-agnostic — callers pass nowMs (server:
// demoNow(); client: useDemoNow()). Here we pass the frozen demo clock
// (2026-05-28) explicitly so age is measured against it.
import { deriveTier } from '../derive';

// Frozen demo clock — same value lib/clock.demoNow() resolves to in DEMO_MODE.
const FROZEN = new Date('2026-05-28T12:00:00.000Z').getTime();

test('deriveTier: static-seed with asOf 30 days ago and staleAfterDays:14 → stale', () => {
  expect(deriveTier({ source: 'static-seed', asOf: '2026-05-09', staleAfterDays: 14, nowMs: FROZEN })).toBe('stale');
});

test('deriveTier: source=estimated with no verifiedSources → estimated', () => {
  expect(deriveTier({ source: 'estimated', nowMs: FROZEN })).toBe('estimated');
});

test('deriveTier: source=eex in verifiedSources → live', () => {
  expect(deriveTier({ source: 'eex', verifiedSources: ['eex'], nowMs: FROZEN })).toBe('live');
});

test('deriveTier: stale check wins over verified source when asOf is old', () => {
  expect(deriveTier({ source: 'eex', verifiedSources: ['eex'], asOf: '2026-05-01', staleAfterDays: 7, nowMs: FROZEN })).toBe('stale');
});

test('deriveTier: no source no asOf → live', () => {
  expect(deriveTier({ nowMs: FROZEN })).toBe('live');
});

// W1-4: age must be measured against the supplied frozen clock (2026-05-28),
// not real wall-clock — otherwise seed data drifts to "stale" as real days pass.
test('freshness uses supplied frozen clock — war-risk badge stays live at 77 days', () => {
  // frozen 2026-05-28, asOf 2026-03-12 = 77 days, staleAfterDays 90 → live
  expect(deriveTier({ asOf: '2026-03-12', staleAfterDays: 90, nowMs: FROZEN })).toBe('live');
});

test('freshness uses supplied frozen clock — stale when age exceeds threshold', () => {
  // frozen 2026-05-28, asOf 2026-02-01 = 116 days > 90 → stale
  expect(deriveTier({ asOf: '2026-02-01', staleAfterDays: 90, nowMs: FROZEN })).toBe('stale');
});

test('deriveTier: no nowMs supplied → neutral Date.now() fallback still derives a tier', () => {
  // Non-demo fallback path: a recent date is not stale.
  const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  expect(deriveTier({ source: 'static-seed', asOf: recent, staleAfterDays: 14 })).toBe('estimated');
});
