import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration020 from '@/lib/migrations/020-toepfer-tmi-seed';

describe('migration 020 toepfer-tmi-seed', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    // migration019 creates the baltic_indices table
    migration019.up(db);
  });

  afterEach(() => db.close());

  it('runs up() without errors', () => {
    expect(() => migration020.up(db)).not.toThrow();
  });

  it('inserts TOEPFER_TMI with value=12683', () => {
    migration020.up(db);
    const row = db
      .prepare(`SELECT * FROM baltic_indices WHERE index_code='TOEPFER_TMI'`)
      .get() as any;
    expect(row).toBeDefined();
    expect(row.value).toBe(12683);
  });

  it('inserts BHSI, BDI, BCI, BSI rows', () => {
    migration020.up(db);
    const rows = db
      .prepare(`SELECT index_code FROM baltic_indices WHERE source='static-seed'`)
      .all() as any[];
    const codes = rows.map((r) => r.index_code);
    expect(codes).toContain('BHSI');
    expect(codes).toContain('BDI');
    expect(codes).toContain('BCI');
    expect(codes).toContain('BSI');
  });

  it('is idempotent (running up() twice does not throw)', () => {
    migration020.up(db);
    expect(() => migration020.up(db)).not.toThrow();
    // Row count should remain 5 (INSERT OR IGNORE)
    const count = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM baltic_indices WHERE source='static-seed'`)
        .get() as any
    ).cnt;
    expect(count).toBe(5);
  });

  it('down() removes static-seed rows', () => {
    migration020.up(db);
    migration020.down(db);
    const rows = db
      .prepare(`SELECT * FROM baltic_indices WHERE source='static-seed'`)
      .all() as any[];
    expect(rows).toHaveLength(0);
  });
});
