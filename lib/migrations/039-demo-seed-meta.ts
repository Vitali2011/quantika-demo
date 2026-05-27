import type { Migration } from './types';

const migration039: Migration = {
  version: 39,
  name: '039-demo-seed-meta',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS demo_seed_meta (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        frozen_date   TEXT    NOT NULL,
        manifest_hash TEXT    NOT NULL,
        generated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS demo_seed_meta;`);
  },
};

export default migration039;
