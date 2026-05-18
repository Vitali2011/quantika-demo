import type { Migration } from "./types";

const migration032: Migration = {
  version: 32,
  name: "matches",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        cargo_id    TEXT NOT NULL,
        vessel_id   TEXT NOT NULL,
        score       INTEGER NOT NULL,
        reason      TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'shortlist'
                    CHECK(status IN ('shortlist','saved','dismissed','archived')),
        user_id     TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_matches_status_created
        ON matches(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_matches_cargo
        ON matches(cargo_id);
      CREATE INDEX IF NOT EXISTS idx_matches_vessel
        ON matches(vessel_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_matches_status_created;
      DROP INDEX IF EXISTS idx_matches_cargo;
      DROP INDEX IF EXISTS idx_matches_vessel;
      DROP TABLE IF EXISTS matches;
    `);
  },
};

export default migration032;
