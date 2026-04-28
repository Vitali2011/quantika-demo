import type { Migration } from './types';

const migration005: Migration = {
  version: 5,
  name: 'opensanctions-cache',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_cache (
        query_hash   TEXT PRIMARY KEY,
        response_json TEXT NOT NULL,
        fetched_at   INTEGER NOT NULL
      );
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS opensanctions_cache;`);
  },
};

export default migration005;
