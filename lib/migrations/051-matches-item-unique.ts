import type { Migration } from './types';

/**
 * Widen match uniqueness to the ITEM pair (audit C.5, founder 2026-06-12).
 *
 * Migration 034 deduped matches to one per (cargo_id, vessel_id, user_id) —
 * i.e. one per EMAIL pair — so the second cargo item parsed from the same
 * email could never persist its own match. Item columns exist since 044
 * (NOT NULL DEFAULT 0). This index makes (pair, item, item) the unique key.
 *
 * No data dedup needed on up(): rows unique under the coarser key are
 * necessarily unique under the finer one. down() must dedup before
 * re-tightening (keep the earliest row per coarse key, mirroring 034).
 */
const migration051: Migration = {
  version: 51,
  name: 'matches-item-unique',
  up(db) {
    db.exec(`DROP INDEX IF EXISTS idx_matches_unique_cargo_vessel_user`);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_pair_item
      ON matches(cargo_id, vessel_id, COALESCE(user_id, ''), cargo_item_index, vessel_item_index)
    `);
  },
  down(db) {
    db.exec(`DROP INDEX IF EXISTS idx_matches_unique_pair_item`);
    db.exec(`
      DELETE FROM matches
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM matches
        GROUP BY cargo_id, vessel_id, COALESCE(user_id, '')
      )
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_cargo_vessel_user
      ON matches(cargo_id, vessel_id, COALESCE(user_id, ''))
    `);
  },
};

export default migration051;
