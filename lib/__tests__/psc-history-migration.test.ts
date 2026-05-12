import Database from 'better-sqlite3';
import migration028 from '../migrations/028-psc-history';

/**
 * Input Contract:
 * - migration028.up(db): expects valid Database.Database, throws on null/undefined
 * - No special floats, negatives, or ranges apply (no numeric inputs)
 * - Empty/closed db → SQL error propagated
 */

// Helper: check whether a table exists
function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(tableName);
  return row !== undefined;
}

// Helper: check whether an index exists
function indexExists(db: Database.Database, indexName: string): boolean {
  const row = db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
    )
    .get(indexName);
  return row !== undefined;
}

describe('migration028 (psc_detention_history)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // RED test: table exists after migration
  it('creates psc_detention_history table with correct schema', () => {
    migration028.up(db);

    expect(tableExists(db, 'psc_detention_history')).toBe(true);
  });

  // RED test: index exists
  it('creates idx_psc_imo index', () => {
    migration028.up(db);

    expect(indexExists(db, 'idx_psc_imo')).toBe(true);
  });

  // RED test: authority CHECK constraint (input contract: invalid authority)
  it('enforces authority CHECK constraint', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority) VALUES (?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('p1', '9123456', '2025-01-01', 'invalid-authority');
    }).toThrow(/CHECK constraint/i);
  });

  // RED test: imo NOT NULL constraint (input contract: empty imo)
  it('enforces imo NOT NULL constraint', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority) VALUES (?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('p1', null, '2025-01-01', 'paris-mou');
    }).toThrow(/NOT NULL/i);
  });

  // RED test: inspection_date NOT NULL constraint
  it('enforces inspection_date NOT NULL constraint', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority) VALUES (?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('p1', '9123456', null, 'paris-mou');
    }).toThrow(/NOT NULL/i);
  });

  // RED test: default values
  it('applies default values for deficiencies, detained, fetched_at', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority) VALUES (?, ?, ?, ?)`
    );
    insert.run('p1', '9123456', '2025-01-01', 'paris-mou');

    const row = db
      .prepare<[string], { deficiencies: number; detained: number; fetched_at: string }>(
        `SELECT deficiencies, detained, fetched_at FROM psc_detention_history WHERE id = ?`
      )
      .get('p1');

    expect(row).toBeDefined();
    expect(row!.deficiencies).toBe(0);
    expect(row!.detained).toBe(0);
    expect(row!.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date format
  });

  // RED test: valid authority values
  it('accepts valid authority values: paris-mou, tokyo-mou, uscg, other', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority) VALUES (?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('p1', '9123456', '2025-01-01', 'paris-mou');
    }).not.toThrow();

    expect(() => {
      insert.run('p2', '9123456', '2025-01-02', 'tokyo-mou');
    }).not.toThrow();

    expect(() => {
      insert.run('p3', '9123456', '2025-01-03', 'uscg');
    }).not.toThrow();

    expect(() => {
      insert.run('p4', '9123456', '2025-01-04', 'other');
    }).not.toThrow();
  });

  // RED test: deficiencies stores integers (including negative - spec says no CHECK)
  it('stores deficiencies as integer (positive, zero, negative)', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority, deficiencies) VALUES (?, ?, ?, ?, ?)`
    );

    insert.run('p1', '9123456', '2025-01-01', 'paris-mou', 5);
    insert.run('p2', '9123456', '2025-01-02', 'tokyo-mou', 0);
    insert.run('p3', '9123456', '2025-01-03', 'uscg', -1);

    const rows = db
      .prepare<[], { id: string; deficiencies: number }>(
        `SELECT id, deficiencies FROM psc_detention_history ORDER BY id`
      )
      .all();

    expect(rows).toHaveLength(3);
    expect(rows[0].deficiencies).toBe(5);
    expect(rows[1].deficiencies).toBe(0);
    expect(rows[2].deficiencies).toBe(-1);
  });

  // RED test: detained stores boolean as integer (0 or 1)
  it('stores detained as integer (0 or 1)', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority, detained) VALUES (?, ?, ?, ?, ?)`
    );

    insert.run('p1', '9123456', '2025-01-01', 'paris-mou', 0);
    insert.run('p2', '9123456', '2025-01-02', 'tokyo-mou', 1);

    const rows = db
      .prepare<[], { id: string; detained: number }>(
        `SELECT id, detained FROM psc_detention_history ORDER BY id`
      )
      .all();

    expect(rows).toHaveLength(2);
    expect(rows[0].detained).toBe(0);
    expect(rows[1].detained).toBe(1);
    expect(typeof rows[0].detained).toBe('number');
    expect(typeof rows[1].detained).toBe('number');
  });

  // RED test: port and source_url can be NULL
  it('allows NULL for port and source_url', () => {
    migration028.up(db);

    const insert = db.prepare(
      `INSERT INTO psc_detention_history (id, imo, inspection_date, authority, port, source_url) VALUES (?, ?, ?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('p1', '9123456', '2025-01-01', 'paris-mou', null, null);
    }).not.toThrow();

    const row = db
      .prepare<[string], { port: string | null; source_url: string | null }>(
        `SELECT port, source_url FROM psc_detention_history WHERE id = ?`
      )
      .get('p1');

    expect(row).toBeDefined();
    expect(row!.port).toBeNull();
    expect(row!.source_url).toBeNull();
  });
});
