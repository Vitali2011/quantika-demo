import type { Migration } from "./types";

const migration035: Migration = {
  version: 35,
  name: "matches-tce-distance",
  up(db) {
    db.exec(`
      ALTER TABLE matches ADD COLUMN tce_usd_per_day REAL;
      ALTER TABLE matches ADD COLUMN distance_nm REAL;
    `);
  },
  down(db) {
    void db;
  },
};

export default migration035;
