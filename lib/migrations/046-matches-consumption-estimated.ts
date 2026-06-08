import type { Migration } from './types';

const migration046: Migration = {
  version: 46,
  name: 'matches-consumption-estimated',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(matches)').all() as Array<{name: string}>;
    const names = new Set(cols.map(c => c.name));
    if (!names.has('consumption_estimated')) {
      db.exec('ALTER TABLE matches ADD COLUMN consumption_estimated INTEGER');
    }
  },
  down(db) { void db; },
};

export default migration046;
