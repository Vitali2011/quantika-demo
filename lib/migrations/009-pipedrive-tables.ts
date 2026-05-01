import type { Migration } from './types';

const migration009: Migration = {
  version: 9,
  name: 'pipedrive-tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipedrive_tokens (
        account_id              INTEGER PRIMARY KEY,
        access_token            TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL,
        expires_at              INTEGER NOT NULL,
        api_domain              TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pipedrive_deal_mapping (
        quote_id           INTEGER PRIMARY KEY,
        pipedrive_deal_id  INTEGER NOT NULL,
        synced_at          INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pd_mapping_deal
        ON pipedrive_deal_mapping(pipedrive_deal_id);
      CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT NOT NULL,
        event      TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_pd_mapping_deal;
      DROP TABLE IF EXISTS pipedrive_deal_mapping;
      DROP TABLE IF EXISTS pipedrive_tokens;
    `);
  },
};

export default migration009;
