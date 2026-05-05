import type { Migration } from './types';

const migration013: Migration = {
  version: 13,
  name: 'knowledge-sources',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        slug                  TEXT PRIMARY KEY,
        name                  TEXT NOT NULL,
        kind                  TEXT NOT NULL,
        category              TEXT NOT NULL,
        source_url            TEXT,
        license               TEXT,
        upstream_version      TEXT,
        fetched_at            DATETIME,
        parsed_at             DATETIME,
        last_synced_at        DATETIME,
        stale_threshold_days  INTEGER NOT NULL,
        status                TEXT NOT NULL DEFAULT 'unknown',
        last_error            TEXT,
        consecutive_failures  INTEGER NOT NULL DEFAULT 0,
        refresh_command       TEXT,
        refresh_mode          TEXT NOT NULL,
        freshness_check_sql   TEXT,
        primary_table         TEXT,
        vector_table          TEXT,
        row_count             INTEGER,
        tenant_scope          TEXT NOT NULL DEFAULT 'global',
        metadata              TEXT,
        created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ksources_status ON knowledge_sources(status);
      CREATE INDEX IF NOT EXISTS idx_ksources_category ON knowledge_sources(category);

      CREATE TABLE IF NOT EXISTS knowledge_sync_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_slug     TEXT NOT NULL REFERENCES knowledge_sources(slug),
        started_at      DATETIME NOT NULL,
        finished_at     DATETIME,
        status          TEXT NOT NULL,
        rows_changed    INTEGER,
        duration_ms     INTEGER,
        error_message   TEXT,
        metadata        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_synclog_source_started
        ON knowledge_sync_log(source_slug, started_at DESC);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_synclog_source_started;
      DROP TABLE IF EXISTS knowledge_sync_log;
      DROP INDEX IF EXISTS idx_ksources_category;
      DROP INDEX IF EXISTS idx_ksources_status;
      DROP TABLE IF EXISTS knowledge_sources;
    `);
  },
};

export default migration013;
