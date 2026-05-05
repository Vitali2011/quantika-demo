import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';

describe('SQLite FK enforcement', () => {
  it('rejects orphan inserts into knowledge_sync_log when FK enabled', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    expect(() => {
      db.prepare(
        "INSERT INTO knowledge_sync_log (source_slug, started_at, status) VALUES (?, CURRENT_TIMESTAMP, 'running')",
      ).run('nonexistent-source');
    }).toThrow(/FOREIGN KEY constraint failed/i);
    db.close();
  });

  it('allows insert when source exists', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    db.prepare(
      "INSERT INTO knowledge_sources (slug, name, kind, category, stale_threshold_days, refresh_mode) VALUES ('test', 'Test', 'structured_rows', 'reference', 7, 'manual')",
    ).run();
    expect(() => {
      db.prepare(
        "INSERT INTO knowledge_sync_log (source_slug, started_at, status) VALUES ('test', CURRENT_TIMESTAMP, 'running')",
      ).run();
    }).not.toThrow();
    db.close();
  });

  it('production session-store opens DB with FK enforcement on', () => {
    // better-sqlite3 11.x happens to default FK ON, but this is a behavioral
    // contract: SessionStore must guarantee FK enforcement regardless of the
    // underlying driver default. If the project ever pins an older version
    // (FK OFF by default), this test catches the regression.
    process.env.SESSIONS_DB_PATH = ':memory:';
    jest.isolateModules(() => {
      const { SessionStore } = require('@/lib/session-store');
      const store = new SessionStore(':memory:');
      // Reach into the private db to check the pragma was applied.
      const fk = (store as { db: Database.Database }).db.pragma('foreign_keys', { simple: true });
      expect(fk).toBe(1);
    });
  });
});
