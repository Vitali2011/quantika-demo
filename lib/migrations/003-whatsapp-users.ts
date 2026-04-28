import type { Migration } from './types';

const migration003: Migration = {
  version: 3,
  name: 'whatsapp-users',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_users (
        phone               TEXT PRIMARY KEY,
        session_id          TEXT NOT NULL,
        onboarded_at        TEXT,
        region              TEXT,
        timezone            TEXT,
        locale              TEXT,
        last_digest_sent_at TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS deal_id_counter (
        session_id  TEXT PRIMARY KEY,
        last_id     INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS deal_id_counter;
      DROP TABLE IF EXISTS whatsapp_users;
    `);
  },
};

export default migration003;
