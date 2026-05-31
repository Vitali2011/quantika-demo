import type { Migration } from './types';

const migration042: Migration = {
  version: 42,
  name: 'matches-fit',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('fit_percent')) {
      db.exec(`ALTER TABLE matches ADD COLUMN fit_percent REAL`);
    }
    if (!names.has('fit_breakdown')) {
      db.exec(`ALTER TABLE matches ADD COLUMN fit_breakdown TEXT`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration042;
