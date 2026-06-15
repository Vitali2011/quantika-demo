import type { Migration } from './types';

const migration052: Migration = {
  version: 52,
  name: 'matches-vessel-cargo-inputs',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('vessel_open_position')) db.exec(`ALTER TABLE matches ADD COLUMN vessel_open_position TEXT`);
    if (!names.has('vessel_speed_kts')) db.exec(`ALTER TABLE matches ADD COLUMN vessel_speed_kts REAL`);
    if (!names.has('vessel_consumption_mt_per_day')) db.exec(`ALTER TABLE matches ADD COLUMN vessel_consumption_mt_per_day REAL`);
    if (!names.has('cargo_quantity_mt')) db.exec(`ALTER TABLE matches ADD COLUMN cargo_quantity_mt REAL`);
  },
  down(db) {
    void db;
  },
};

export default migration052;
