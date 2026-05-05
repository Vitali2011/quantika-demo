import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';

describe('migration 013 knowledge-sources', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
  });
  afterEach(() => db.close());

  it('creates knowledge_sources table with PK on slug', () => {
    migration013.up(db);
    const cols = db.prepare("PRAGMA table_info(knowledge_sources)").all() as any[];
    expect(cols.find((c) => c.name === 'slug')?.pk).toBe(1);
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'slug', 'name', 'kind', 'category', 'source_url', 'license',
        'upstream_version', 'fetched_at', 'parsed_at', 'last_synced_at',
        'stale_threshold_days', 'status', 'last_error', 'consecutive_failures',
        'refresh_command', 'refresh_mode', 'freshness_check_sql',
        'primary_table', 'vector_table', 'row_count', 'tenant_scope',
        'metadata', 'created_at', 'updated_at',
      ])
    );
  });

  it('creates knowledge_sync_log with FK to source_slug', () => {
    migration013.up(db);
    const cols = db.prepare("PRAGMA table_info(knowledge_sync_log)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'source_slug', 'started_at', 'finished_at', 'status',
        'rows_changed', 'duration_ms', 'error_message', 'metadata',
      ])
    );
    const fks = db.prepare("PRAGMA foreign_key_list(knowledge_sync_log)").all() as any[];
    expect(fks.some((fk) => fk.table === 'knowledge_sources' && fk.from === 'source_slug')).toBe(true);
  });

  it('rolls back cleanly via down()', () => {
    migration013.up(db);
    migration013.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('knowledge_sources');
    expect(tables.map((t) => t.name)).not.toContain('knowledge_sync_log');
  });
});
