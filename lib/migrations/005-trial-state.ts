import type { Migration } from './types';

const migration005: Migration = {
  version: 5,
  name: 'trial-state',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trial_state (
        session_id   TEXT PRIMARY KEY,
        started_at   TEXT NOT NULL,
        ends_at      TEXT NOT NULL,
        activated_at TEXT,
        region       TEXT,
        demo_seeded  INTEGER DEFAULT 0
      );
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS trial_state;`);
  },
};

export default migration005;
