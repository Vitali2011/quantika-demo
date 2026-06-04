/**
 * Behavioral test for #791 cause B — real-matches seed persists cargo_item_index
 * and vessel_item_index on INSERT (fixes Source Attribution itemIndex=0 default
 * masking the correct cargo line in hydrate-demo-session.ts).
 */
import Database from 'better-sqlite3';
import {
  buildMatchInsertSql,
  tableHasItemIndexCols,
} from '../real-matches';

function setupSchemaWithIdxCols(db: Database.Database): void {
  db.exec(`
    CREATE TABLE matches (
      cargo_id TEXT NOT NULL,
      vessel_id TEXT NOT NULL,
      cargo_item_index INTEGER NOT NULL DEFAULT 0,
      vessel_item_index INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      cargo_type TEXT,
      load_port TEXT,
      discharge_port TEXT,
      laycan_start INTEGER,
      laycan_end INTEGER,
      vessel_dwt INTEGER,
      tce_usd_per_day REAL,
      distance_nm REAL,
      freight_rate_usd_per_mt REAL,
      freight_rate_source TEXT,
      fit_percent REAL,
      fit_breakdown TEXT,
      worksheet_json TEXT,
      reason_structured TEXT
    );
  `);
}

function setupSchemaLegacy(db: Database.Database): void {
  db.exec(`
    CREATE TABLE matches (
      cargo_id TEXT NOT NULL,
      vessel_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      cargo_type TEXT,
      load_port TEXT,
      discharge_port TEXT,
      laycan_start INTEGER,
      laycan_end INTEGER,
      vessel_dwt INTEGER,
      tce_usd_per_day REAL,
      distance_nm REAL,
      freight_rate_usd_per_mt REAL,
      freight_rate_source TEXT,
      fit_percent REAL,
      fit_breakdown TEXT,
      worksheet_json TEXT,
      reason_structured TEXT
    );
  `);
}

describe('buildMatchInsertSql (#791 cause B)', () => {
  it('includes cargo_item_index / vessel_item_index when hasIdxCol=true', () => {
    const sql = buildMatchInsertSql(true);
    expect(sql).toMatch(/cargo_item_index/);
    expect(sql).toMatch(/vessel_item_index/);
  });

  it('omits item-index columns for legacy DBs (hasIdxCol=false)', () => {
    const sql = buildMatchInsertSql(false);
    expect(sql).not.toMatch(/cargo_item_index/);
    expect(sql).not.toMatch(/vessel_item_index/);
  });
});

describe('tableHasItemIndexCols (#791 cause B)', () => {
  it('returns true when matches has cargo_item_index column (post-mig 044)', () => {
    const db = new Database(':memory:');
    setupSchemaWithIdxCols(db);
    expect(tableHasItemIndexCols(db)).toBe(true);
    db.close();
  });

  it('returns false for legacy matches schema', () => {
    const db = new Database(':memory:');
    setupSchemaLegacy(db);
    expect(tableHasItemIndexCols(db)).toBe(false);
    db.close();
  });
});

describe('real-matches INSERT persists item indexes (#791 cause B)', () => {
  it('writes non-zero cargo_item_index when the cargo email had multiple items', () => {
    const db = new Database(':memory:');
    setupSchemaWithIdxCols(db);

    const insert = db.prepare(buildMatchInsertSql(true));
    // Mirror real-matches.ts: bindings order matches buildMatchInsertSql.
    insert.run(
      'cargo-multi-email', 'vessel-1',
      2, 0,                                         // cargoItemIndex=2 (3rd item), vesselItemIndex=0
      82, 'good fit', 'sentinel-user', 1_700_000_000, 1_700_000_000,
      'BULK', 'Marmara', 'Constanța', 1_700_001_000, 1_700_002_000, 5500,
      9000, 100, 28, 'baltic',
      82.5, '{}', '{}', '{}',
    );

    const row = db.prepare(
      'SELECT cargo_item_index, vessel_item_index FROM matches WHERE cargo_id = ?',
    ).get('cargo-multi-email') as { cargo_item_index: number; vessel_item_index: number };

    expect(row.cargo_item_index).toBe(2);
    expect(row.vessel_item_index).toBe(0);
    db.close();
  });

  it('legacy DB (no idx cols) accepts inserts without item-index bindings', () => {
    const db = new Database(':memory:');
    setupSchemaLegacy(db);

    const insert = db.prepare(buildMatchInsertSql(false));
    insert.run(
      'cargo-legacy', 'vessel-legacy',
      75, 'legacy fit', null, 1_700_000_000, 1_700_000_000,
      'BULK', 'Karasu', 'Mykolaiv', 1_700_001_000, 1_700_002_000, 5000,
      8000, 200, 30, 'baltic',
      75.0, '{}', '{}', '{}',
    );

    const cnt = (db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n;
    expect(cnt).toBe(1);
    db.close();
  });
});
