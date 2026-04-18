import type { Migration } from './types';

const migration001: Migration = {
  version: 1,
  name: 'initial-sessions',
  up(db) {
    db.exec(
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, access_token TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, data TEXT NOT NULL)'
    );
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS sessions');
  },
};

export default migration001;
