import type { Migration } from "./types";

const migration033: Migration = {
  version: 33,
  name: "matches-score-breakdown",
  up(db) {
    db.exec(`
      ALTER TABLE matches ADD COLUMN reason_structured TEXT;
      ALTER TABLE matches ADD COLUMN cargo_type TEXT;
      ALTER TABLE matches ADD COLUMN load_port TEXT;
      ALTER TABLE matches ADD COLUMN discharge_port TEXT;
      ALTER TABLE matches ADD COLUMN laycan_start INTEGER;
      ALTER TABLE matches ADD COLUMN laycan_end INTEGER;
      ALTER TABLE matches ADD COLUMN vessel_dwt INTEGER;
    `);
  },
  down(db) {
    // SQLite does not support DROP COLUMN in all versions;
    // migration is effectively irreversible in SQLite without recreating the table.
    void db;
  },
};

export default migration033;
