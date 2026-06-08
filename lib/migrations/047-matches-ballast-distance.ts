import type { Migration } from './types';

const migration047: Migration = {
  version: 47,
  name: 'matches-ballast-distance',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('ballast_distance_nm')) {
      db.exec(`ALTER TABLE matches ADD COLUMN ballast_distance_nm REAL`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration047;
