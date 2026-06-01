import type { Migration } from './types';

const migration045: Migration = {
  version: 45,
  name: 'matches-worksheet',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('worksheet_json')) {
      db.exec(`ALTER TABLE matches ADD COLUMN worksheet_json TEXT`);
    }
  },
  down(db) {
    void db;
  },
};

export default migration045;
