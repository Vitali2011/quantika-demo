/**
 * Item-aware slug resolution (audit W1-3 round 2).
 *
 * The /cargo/[id] page must resolve the DB match id of a SPECIFIC cargo item so
 * the quote worker drafts for that item — not always item 0. The old
 * getMatchBySlug keys on (cargo_id, vessel_id, user_id) with LIMIT 1, so when two
 * cargo items of the same email match the SAME vessel (two distinct rows since
 * migration 051) both items resolve to the same row → same match id → wrong item.
 *
 * getMatchBySlugAndItem adds the item pair to the WHERE clause; migration 051's
 * unique index guarantees at most one row, so each item gets its own match id.
 *
 * Runs the full migration chain so the schema under test is the real one.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import {
  createMatch,
  getMatchBySlug,
  getMatchBySlugAndItem,
} from '@/lib/matching/matches-repository';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

const base = {
  cargo_id: 'cargo-email-1',
  vessel_id: 'vessel-email-1',
  score: 70,
  reason: 'r',
  user_id: 'sess-1',
};

describe('getMatchBySlugAndItem (item-aware slug resolution)', () => {
  // QA Finding 1 — ITEM-BLIND: two cargo items, ONE vessel → must resolve to
  // two DIFFERENT match ids (the page passes a per-item match id to the worker).
  it('two cargo items matching the same vessel resolve to DIFFERENT match ids', () => {
    const db = makeDb();
    const m0 = createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    const m1 = createMatch(db, { ...base, cargo_item_index: 1, vessel_item_index: 0, fit_percent: 75 });
    expect(m0.id).not.toBe(m1.id);

    const r0 = getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 0, 0);
    const r1 = getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 1, 0);

    expect(r0?.id).toBe(m0.id);
    expect(r1?.id).toBe(m1.id);
    expect(r0!.id).not.toBe(r1!.id);

    // Regression guard: the old item-blind resolver collapses both onto one row.
    const blind0 = getMatchBySlug(db, base.cargo_id, base.vessel_id, base.user_id);
    const blind1 = getMatchBySlug(db, base.cargo_id, base.vessel_id, base.user_id);
    expect(blind0!.id).toBe(blind1!.id); // proves why item-blind resolution is wrong
  });

  // QA Finding 2 — POSITIONAL INDEX: itemIndex need not equal array position.
  // Resolving by canonical cargo.itemIndex (2,3) finds the right rows; the row
  // does not exist at array positions 0/1.
  it('resolves by canonical itemIndex, not array position (sparse items 2,3)', () => {
    const db = makeDb();
    const m2 = createMatch(db, { ...base, cargo_item_index: 2, vessel_item_index: 0, fit_percent: 80 });
    const m3 = createMatch(db, { ...base, cargo_item_index: 3, vessel_item_index: 0, fit_percent: 75 });

    // Correct: canonical itemIndex finds the row.
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 2, 0)?.id).toBe(m2.id);
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 3, 0)?.id).toBe(m3.id);

    // Wrong: array positions 0/1 (what page.tsx used) match no row for this pair.
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 0, 0)).toBeNull();
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 1, 0)).toBeNull();
  });

  it('returns null when no row matches the item pair', () => {
    const db = makeDb();
    createMatch(db, { ...base, cargo_item_index: 0, vessel_item_index: 0, fit_percent: 80 });
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, base.user_id, 0, 9)).toBeNull();
    expect(getMatchBySlugAndItem(db, base.cargo_id, base.vessel_id, 'other-sess', 0, 0)).toBeNull();
  });
});
