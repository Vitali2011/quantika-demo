import type { Migration } from './types';

const migration012: Migration = {
  version: 12,
  name: 'ai-audit',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        cost_usd REAL,
        latency_ms INTEGER,
        ok BOOLEAN,
        err TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_audit_scope ON ai_audit(scope);
      CREATE INDEX IF NOT EXISTS idx_ai_audit_created_at ON ai_audit(created_at DESC);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_ai_audit_created_at;
      DROP INDEX IF EXISTS idx_ai_audit_scope;
      DROP TABLE IF EXISTS ai_audit;
    `);
  },
};

export default migration012;
