import type { Migration } from './types';

const migration037: Migration = {
  version: 37,
  name: '037-add-user-preferred-mode',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        username       TEXT PRIMARY KEY,
        preferred_mode TEXT NOT NULL DEFAULT 'charterer'
      )
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS user_preferences');
  },
};

export default migration037;
