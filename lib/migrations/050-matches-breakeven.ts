import type { Migration } from './types';

const migration050: Migration = {
  version: 50,
  name: 'matches-breakeven',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('breakeven_tce_usd_per_day')) {
      db.exec(`ALTER TABLE matches ADD COLUMN breakeven_tce_usd_per_day REAL`);
    }
  },
  down(db) { void db; },
};

export default migration050;
