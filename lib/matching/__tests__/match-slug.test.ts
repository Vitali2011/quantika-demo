import Database from 'better-sqlite3';
import { toMatchSlug, fromMatchSlug } from '@/lib/matching/match-slug';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import { createMatch, getMatchBySlug } from '@/lib/matching/matches-repository';

describe('toMatchSlug', () => {
  it('encodes cargo and vessel ids with -- separator', () => {
    expect(toMatchSlug('demo-cargo-001', 'demo-vessel-001')).toBe(
      'demo-cargo-001--demo-vessel-001',
    );
  });

  it('is stable — same inputs produce same slug', () => {
    const a = toMatchSlug('cargo-x', 'vessel-y');
    const b = toMatchSlug('cargo-x', 'vessel-y');
    expect(a).toBe(b);
  });
});

describe('fromMatchSlug', () => {
  it('round-trips with toMatchSlug', () => {
    const slug = toMatchSlug('demo-cargo-economics', 'demo-vessel-economics');
    const result = fromMatchSlug(slug);
    expect(result).toEqual({
      cargo_id: 'demo-cargo-economics',
      vessel_id: 'demo-vessel-economics',
    });
  });

  it('returns null for non-slug strings (no -- separator)', () => {
    expect(fromMatchSlug('abc')).toBeNull();
    expect(fromMatchSlug('123')).toBeNull();
    expect(fromMatchSlug('')).toBeNull();
  });

  it('returns null when cargo_id is empty', () => {
    expect(fromMatchSlug('--vessel-1')).toBeNull();
  });

  it('returns null when vessel_id is empty', () => {
    expect(fromMatchSlug('cargo-1--')).toBeNull();
  });
});

/** Since migration 051 a slug's (cargo_id, vessel_id, user) may match several
 *  item rows — getMatchBySlug must deterministically resolve to the best one
 *  (fit DESC, then score, then id; audit C.5). */
describe('getMatchBySlug — multiple item rows per pair', () => {
  it('resolves to the higher-fit item row', () => {
    const db = new Database(':memory:');
    runMigrations(db, allMigrations);
    const base = { cargo_id: 'cargo-e1', vessel_id: 'vessel-e1', score: 70, reason: 'r', user_id: 'sess-1' };
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 75 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 80 });

    const resolved = getMatchBySlug(db, 'cargo-e1', 'vessel-e1', 'sess-1');
    expect(resolved?.fit_percent).toBe(80);
    expect(resolved?.cargo_item_index).toBe(1);
  });
});
