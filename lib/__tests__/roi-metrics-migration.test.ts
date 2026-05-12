import Database from 'better-sqlite3';
import migration030 from '../migrations/030-roi-metrics';

/**
 * Input Contract:
 * - migration030.up(db): expects valid Database.Database, throws on null/undefined
 * - No numeric inputs to validate (migration takes only db)
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

describe('migration030 (roi_metrics)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // RED test: table exists after migration
  it('creates roi_metrics table with correct schema', () => {
    migration030.up(db);

    expect(tableExists(db, 'roi_metrics')).toBe(true);
  });

  // RED test: cohort index exists
  it('creates idx_roi_cohort index', () => {
    migration030.up(db);

    expect(indexExists(db, 'idx_roi_cohort')).toBe(true);
  });

  // RED test: voyage index exists
  it('creates idx_roi_voyage index', () => {
    migration030.up(db);

    expect(indexExists(db, 'idx_roi_voyage')).toBe(true);
  });

  // RED test: NOT NULL constraints on required fields
  it('enforces NOT NULL constraints on id, voyage_id, deal_date, cohort_month', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month) VALUES (?, ?, ?, ?)`
    );

    // Missing id
    expect(() => {
      insert.run(null, 'v1', '2025-01-15', '2025-01');
    }).toThrow(/NOT NULL/i);

    // Missing voyage_id
    expect(() => {
      insert.run('r1', null, '2025-01-15', '2025-01');
    }).toThrow(/NOT NULL/i);

    // Missing deal_date
    expect(() => {
      insert.run('r1', 'v1', null, '2025-01');
    }).toThrow(/NOT NULL/i);

    // Missing cohort_month
    expect(() => {
      insert.run('r1', 'v1', '2025-01-15', null);
    }).toThrow(/NOT NULL/i);
  });

  // RED test: nullable financial fields accepted
  it('allows NULL for freight_usd, bunker_cost_usd, demurrage_usd, despatch_usd, tce_actual_usd, tce_baseline_usd', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month) VALUES (?, ?, ?, ?)`
    );

    expect(() => {
      insert.run('r1', 'v1', '2025-01-15', '2025-01');
    }).not.toThrow();

    const row = db
      .prepare<[string], { freight_usd: number | null; tce_actual_usd: number | null }>(
        `SELECT freight_usd, tce_actual_usd FROM roi_metrics WHERE id = ?`
      )
      .get('r1');

    expect(row).toBeDefined();
    expect(row!.freight_usd).toBeNull();
    expect(row!.tce_actual_usd).toBeNull();
  });

  // RED test: savings_usd GENERATED column computes correctly
  it('computes savings_usd as tce_actual_usd - tce_baseline_usd with COALESCE to 0', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month, tce_actual_usd, tce_baseline_usd) VALUES (?, ?, ?, ?, ?, ?)`
    );

    // Both values present
    insert.run('r1', 'v1', '2025-01-15', '2025-01', 15000, 12000);

    // NULL baseline (should COALESCE to 0)
    insert.run('r2', 'v2', '2025-01-16', '2025-01', 8000, null);

    // NULL actual (should COALESCE to 0)
    insert.run('r3', 'v3', '2025-01-17', '2025-01', null, 5000);

    // Both NULL (should result in 0 - 0 = 0)
    insert.run('r4', 'v4', '2025-01-18', '2025-01', null, null);

    const rows = db
      .prepare<[], { id: string; savings_usd: number }>(
        `SELECT id, savings_usd FROM roi_metrics ORDER BY id`
      )
      .all();

    expect(rows).toHaveLength(4);
    expect(rows[0].savings_usd).toBe(3000); // 15000 - 12000
    expect(rows[1].savings_usd).toBe(8000); // 8000 - 0
    expect(rows[2].savings_usd).toBe(-5000); // 0 - 5000
    expect(rows[3].savings_usd).toBe(0); // 0 - 0
  });

  // RED test: created_at default value is ISO datetime
  it('applies default created_at value in ISO format', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month) VALUES (?, ?, ?, ?)`
    );
    insert.run('r1', 'v1', '2025-01-15', '2025-01');

    const row = db
      .prepare<[string], { created_at: string }>(
        `SELECT created_at FROM roi_metrics WHERE id = ?`
      )
      .get('r1');

    expect(row).toBeDefined();
    expect(row!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date format
  });

  // RED test: negative financial values accepted (corrections, despatch)
  it('stores negative financial values', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month, freight_usd, demurrage_usd, despatch_usd) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    insert.run('r1', 'v1', '2025-01-15', '2025-01', -100, -50, -200);

    const row = db
      .prepare<[string], { freight_usd: number; demurrage_usd: number; despatch_usd: number }>(
        `SELECT freight_usd, demurrage_usd, despatch_usd FROM roi_metrics WHERE id = ?`
      )
      .get('r1');

    expect(row).toBeDefined();
    expect(row!.freight_usd).toBe(-100);
    expect(row!.demurrage_usd).toBe(-50);
    expect(row!.despatch_usd).toBe(-200);
  });

  // RED test: PRIMARY KEY constraint on id
  it('enforces PRIMARY KEY constraint on id', () => {
    migration030.up(db);

    const insert = db.prepare(
      `INSERT INTO roi_metrics (id, voyage_id, deal_date, cohort_month) VALUES (?, ?, ?, ?)`
    );

    insert.run('r1', 'v1', '2025-01-15', '2025-01');

    expect(() => {
      insert.run('r1', 'v2', '2025-01-16', '2025-01'); // duplicate id
    }).toThrow(/UNIQUE|PRIMARY KEY/i);
  });
});
