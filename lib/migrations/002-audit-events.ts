import type { Migration } from './types';

const migration002: Migration = {
  version: 2,
  name: 'audit-events',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id           TEXT PRIMARY KEY,
        timestamp    TEXT NOT NULL,
        session_id   TEXT NOT NULL,
        inquiry_id   TEXT,
        actor        TEXT NOT NULL CHECK (actor IN ('ai', 'user', 'system')),
        action       TEXT NOT NULL,
        field        TEXT,
        before_value TEXT,
        after_value  TEXT,
        reason       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_session   ON audit_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_inquiry   ON audit_events(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_audit_timestamp;
      DROP INDEX IF EXISTS idx_audit_inquiry;
      DROP INDEX IF EXISTS idx_audit_session;
      DROP TABLE IF EXISTS audit_events;
    `);
  },
};

export default migration002;
