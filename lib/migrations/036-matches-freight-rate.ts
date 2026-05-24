import type { Migration } from "./types";

const migration036: Migration = {
  version: 36,
  name: "matches-freight-rate",
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('freight_rate_usd_per_mt')) {
      db.exec(`ALTER TABLE matches ADD COLUMN freight_rate_usd_per_mt REAL`);
    }
    if (!names.has('freight_rate_source')) {
      db.exec(`ALTER TABLE matches ADD COLUMN freight_rate_source TEXT`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration036;
