import type { Migration } from './types';

const migration041: Migration = {
  version: 41,
  name: 'matches-vessel-name',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('vessel_name')) {
      db.exec(`ALTER TABLE matches ADD COLUMN vessel_name TEXT`);
    }
    if (!names.has('cargo_ref')) {
      db.exec(`ALTER TABLE matches ADD COLUMN cargo_ref TEXT`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration041;
