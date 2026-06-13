/** Audit C.5 (founder 2026-06-12): one match per ITEM pair. Two cargo items
 *  from the same email matching the same vessel are two distinct rows.
 *
 *  Runs the FULL migration chain (incl. 051-matches-item-unique) — the unique
 *  index under test is exactly what the runner produces on a real DB.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

const base = {
  cargo_id: 'cargo-email-1', vessel_id: 'vessel-email-1',
  score: 70, reason: 'r', user_id: 'sess-1',
};

describe('item-aware match uniqueness (migration 051)', () => {
  it('persists two rows for two cargo items of the same email pair', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.cargo_item_index))).toEqual(new Set([0, 1]));
  });

  it('same item pair twice stays one row (INSERT OR IGNORE)', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0 });
    expect(listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' })).toHaveLength(1);
  });

  it('duplicate insert returns the existing row of the SAME item pair', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    const dup = createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    expect(dup.cargo_item_index).toBe(1);
  });

  it('refreshComputed updates ONLY the matching item row', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, score: 70, fit_percent: 80 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, score: 60, fit_percent: 75 });
    createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, score: 65, fit_percent: 77, refreshComputed: true });
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    const item0 = rows.find((r) => r.cargo_item_index === 0)!;
    const item1 = rows.find((r) => r.cargo_item_index === 1)!;
    expect(item0.fit_percent).toBe(80); // untouched — the old WHERE clobbered both
    expect(item1.fit_percent).toBe(77);
  });
});
