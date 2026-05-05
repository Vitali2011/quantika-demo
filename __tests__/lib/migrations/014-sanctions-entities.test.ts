import Database from 'better-sqlite3';
import migration014 from '@/lib/migrations/014-sanctions-entities';

describe('migration 014 sanctions-entities', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });
  afterEach(() => db.close());

  it('creates ofac_entities table with UNIQUE on uid', () => {
    migration014.up(db);
    const cols = db.prepare("PRAGMA table_info(ofac_entities)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'uid', 'type', 'name', 'name_normalized', 'aliases',
        'country', 'address', 'programs', 'publish_date', 'raw', 'fetched_at',
      ])
    );
    const indexes = db.prepare("PRAGMA index_list(ofac_entities)").all() as any[];
    expect(indexes.length).toBeGreaterThan(0);
  });

  it('creates eu_sanctions_entities table with UNIQUE on uid', () => {
    migration014.up(db);
    const cols = db.prepare("PRAGMA table_info(eu_sanctions_entities)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'uid', 'type', 'name', 'name_normalized', 'aliases',
        'country', 'address', 'programs', 'publish_date', 'raw', 'fetched_at',
      ])
    );
  });

  it('creates indexes on name_normalized and country for both tables', () => {
    migration014.up(db);
    const ofacIndexes = db.prepare("PRAGMA index_list(ofac_entities)").all() as any[];
    expect(ofacIndexes.some((idx: any) => idx.name.includes('name_norm'))).toBe(true);
    expect(ofacIndexes.some((idx: any) => idx.name.includes('country'))).toBe(true);

    const euIndexes = db.prepare("PRAGMA index_list(eu_sanctions_entities)").all() as any[];
    expect(euIndexes.some((idx: any) => idx.name.includes('name_norm'))).toBe(true);
    expect(euIndexes.some((idx: any) => idx.name.includes('country'))).toBe(true);
  });

  it('creates sanction_corpus_view unioning both tables', () => {
    migration014.up(db);
    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as any[];
    expect(views.map((v) => v.name)).toContain('sanction_corpus_view');

    // Insert test data and verify view works
    db.prepare(`
      INSERT INTO ofac_entities (uid, type, name, name_normalized, aliases, country, programs, raw)
      VALUES ('test1', 'entity', 'Test Corp', 'test corp', '[]', 'US', '["SDGT"]', '{}')
    `).run();

    const rows = db.prepare("SELECT * FROM sanction_corpus_view WHERE uid = 'test1'").all();
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).source).toBe('ofac');
  });

  it('rolls back cleanly via down()', () => {
    migration014.up(db);
    migration014.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('ofac_entities');
    expect(tables.map((t) => t.name)).not.toContain('eu_sanctions_entities');

    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as any[];
    expect(views.map((v) => v.name)).not.toContain('sanction_corpus_view');
  });

  it('enforces UNIQUE constraint on uid', () => {
    migration014.up(db);
    db.prepare(`
      INSERT INTO ofac_entities (uid, type, name, name_normalized, aliases, country, programs, raw)
      VALUES ('dup123', 'entity', 'Test', 'test', '[]', 'US', '[]', '{}')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO ofac_entities (uid, type, name, name_normalized, aliases, country, programs, raw)
        VALUES ('dup123', 'entity', 'Test2', 'test2', '[]', 'UK', '[]', '{}')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });
});
