import type { Migration } from './types';

/**
 * Add cargo_item_index / vessel_item_index to matches.
 *
 * A single email can carry several parsed cargo/vessel items (itemIndex 0..N).
 * Until now demo seed matches assumed item 0 of each email (hydrate-demo-session
 * rowsToMatches hard-coded cargoItemIndex:0 / vesselItemIndex:0), so a match
 * referencing item N could never be rendered with the correct cargo/vessel.
 * These columns let a seed/session match record which item it pairs, so the
 * detail panel resolves the right ParsedCargo/ParsedVessel.
 *
 * DEFAULT 0 keeps every existing row pointing at item 0 (the prior behaviour).
 * The unique index stays (cargo_id, vessel_id, user_id) — matches are deduped
 * to one per email-pair, so no item-level uniqueness is required.
 */
const migration044: Migration = {
  version: 44,
  name: 'matches-item-index',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('cargo_item_index')) {
      db.exec(`ALTER TABLE matches ADD COLUMN cargo_item_index INTEGER NOT NULL DEFAULT 0`);
    }
    if (!names.has('vessel_item_index')) {
      db.exec(`ALTER TABLE matches ADD COLUMN vessel_item_index INTEGER NOT NULL DEFAULT 0`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration044;
