import type { Migration } from "./types";

const migration034: Migration = {
  version: 34,
  name: "matches-unique-cargo-vessel-user",
  up(db) {
    // Remove any pre-existing duplicates, keeping the earliest row per unique combination.
    // COALESCE(user_id, '') treats NULL user_ids as equivalent for dedup purposes.
    db.exec(`
      DELETE FROM matches
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM matches
        GROUP BY cargo_id, vessel_id, COALESCE(user_id, '')
      )
    `);
    // Expression index so NULL user_ids are treated as '' — prevents NULL != NULL
    // loophole where two rows with NULL user_id would not conflict in a plain UNIQUE index.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_cargo_vessel_user
      ON matches(cargo_id, vessel_id, COALESCE(user_id, ''))
    `);
  },
  down(db) {
    db.exec(`DROP INDEX IF EXISTS idx_matches_unique_cargo_vessel_user`);
  },
};

export default migration034;
