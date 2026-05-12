import Database from 'better-sqlite3';
import migration026 from '../migrations/026-charterers';

/**
 * Input Contract:
 * - migration026.up(db): expects valid Database.Database, throws on null/undefined
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

describe('migration026 (charterers)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // RED test: table exists after migration
  it('creates charterers table with correct schema', () => {
    migration026.up(db);

    expect(tableExists(db, 'charterers')).toBe(true);
  });

  // RED test: indices exist
  it('creates idx_charterers_tier index', () => {
    migration026.up(db);

    expect(indexExists(db, 'idx_charterers_tier')).toBe(true);
  });

  it('creates idx_charterers_name index', () => {
    migration026.up(db);

    expect(indexExists(db, 'idx_charterers_name')).toBe(true);
  });

  // RED test: tier CHECK constraint (input contract: invalid tier)
  it('enforces tier CHECK constraint', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`
    );

    expect(() => {
      insert.run('c1', 'Test Corp', 'invalid-tier');
    }).toThrow(/CHECK constraint/i);
  });

  // RED test: name NOT NULL constraint (input contract: empty name)
  it('enforces name NOT NULL constraint', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`
    );

    expect(() => {
      insert.run('c1', null, 'blue-chip');
    }).toThrow(/NOT NULL/i);
  });

  // RED test: name UNIQUE constraint
  it('enforces name UNIQUE constraint', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`
    );

    insert.run('c1', 'Duplicate Name', 'blue-chip');

    expect(() => {
      insert.run('c2', 'Duplicate Name', 'second');
    }).toThrow(/UNIQUE constraint/i);
  });

  // RED test: default values
  it('applies default values for payment_history, require_lc, created_at', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`
    );
    insert.run('c1', 'Test Corp', 'blue-chip');

    const row = db
      .prepare<[string], { payment_history: string; require_lc: number; created_at: string }>(
        `SELECT payment_history, require_lc, created_at FROM charterers WHERE id = ?`
      )
      .get('c1');

    expect(row).toBeDefined();
    expect(row!.payment_history).toBe('[]');
    expect(row!.require_lc).toBe(0);
    expect(row!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date format
  });

  // RED test: valid tier values
  it('accepts valid tier values: blue-chip, second, weak', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier) VALUES (?, ?, ?)`
    );

    expect(() => {
      insert.run('c1', 'Blue Chip Corp', 'blue-chip');
    }).not.toThrow();

    expect(() => {
      insert.run('c2', 'Second Tier Corp', 'second');
    }).not.toThrow();

    expect(() => {
      insert.run('c3', 'Weak Corp', 'weak');
    }).not.toThrow();
  });

  // RED test: require_lc stores integers
  it('stores require_lc as integer (0 or 1)', () => {
    migration026.up(db);

    const insert = db.prepare(
      `INSERT INTO charterers (id, name, tier, require_lc) VALUES (?, ?, ?, ?)`
    );

    insert.run('c1', 'Test Corp 1', 'blue-chip', 0);
    insert.run('c2', 'Test Corp 2', 'second', 1);

    const rows = db
      .prepare<[], { id: string; require_lc: number }>(
        `SELECT id, require_lc FROM charterers ORDER BY id`
      )
      .all();

    expect(rows).toHaveLength(2);
    expect(rows[0].require_lc).toBe(0);
    expect(rows[1].require_lc).toBe(1);
    expect(typeof rows[0].require_lc).toBe('number');
    expect(typeof rows[1].require_lc).toBe('number');
  });
});
