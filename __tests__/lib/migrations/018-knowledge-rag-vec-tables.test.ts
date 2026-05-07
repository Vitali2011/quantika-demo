import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration018 from '@/lib/migrations/018-knowledge-rag-vec-tables';

describe('migration 018 knowledge-rag-vec-tables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Load sqlite-vec BEFORE migration runs (matches production behavior in lib/db/index.ts:19)
    sqliteVec.load(db);
  });

  afterEach(() => db.close());

  // TC-NBI-01: dimension mismatch (384 instead of 768)
  it('rejects INSERT with wrong embedding dimension (384 instead of 768)', () => {
    migration018.up(db);
    const embedding384 = new Float32Array(384).fill(0.5);
    const stmt = db.prepare('INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding384, 'test content', '{"key":"value"}')).toThrow();
  });

  // TC-NBI-02: empty content string
  it('accepts INSERT with empty content string', () => {
    migration018.up(db);
    const embedding768 = new Float32Array(768).fill(0.1);
    const stmt = db.prepare('INSERT INTO igc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, '', '{"key":"value"}')).not.toThrow();
  });

  // TC-NBI-03: null metadata — sqlite-vec TEXT rejects NULL, use empty string instead
  it('accepts INSERT with empty metadata string (NULL is rejected by vec0 TEXT)', () => {
    migration018.up(db);
    const embedding768 = new Float32Array(768).fill(0.2);
    const stmt = db.prepare('INSERT INTO jwc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, 'content', '')).not.toThrow();
  });

  // TC-NBI-04: invalid JSON metadata
  it('accepts INSERT with invalid JSON metadata (no validation at DB level)', () => {
    migration018.up(db);
    const embedding768 = new Float32Array(768).fill(0.3);
    const stmt = db.prepare('INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, 'content', 'not json')).not.toThrow();
  });

  // TC-NBI-05: idempotent up()
  it('is idempotent — calling up() twice does not throw', () => {
    migration018.up(db);
    expect(() => migration018.up(db)).not.toThrow();
  });

  // TC-NBI-06: down() on empty db
  it('down() succeeds on empty database (tables do not exist)', () => {
    // Do NOT call up() first — test down() on fresh db
    expect(() => migration018.down(db)).not.toThrow();
  });

  // Acceptance: verify 3 tables exist after up()
  it('creates imsbc_vec, igc_vec, jwc_vec virtual tables after up()', () => {
    migration018.up(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_vec'").all() as any[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('imsbc_vec');
    expect(tableNames).toContain('igc_vec');
    expect(tableNames).toContain('jwc_vec');
  });

  // Acceptance: INSERT valid embedding succeeds
  it('accepts INSERT with valid Float32Array[768] embedding for all 3 tables', () => {
    migration018.up(db);
    const embedding768 = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      embedding768[i] = Math.random();
    }

    const stmtImsbc = db.prepare('INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    const stmtIgc = db.prepare('INSERT INTO igc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    const stmtJwc = db.prepare('INSERT INTO jwc_vec (embedding, content, metadata) VALUES (?, ?, ?)');

    expect(() => stmtImsbc.run(embedding768, 'IMSBC content', '{"source":"imsbc"}')).not.toThrow();
    expect(() => stmtIgc.run(embedding768, 'IGC content', '{"source":"igc"}')).not.toThrow();
    expect(() => stmtJwc.run(embedding768, 'JWC content', '{"source":"jwc"}')).not.toThrow();
  });

  // Acceptance: SELECT returns inserted row
  it('retrieves inserted row via SELECT with correct content and metadata', () => {
    migration018.up(db);
    const embedding768 = new Float32Array(768).fill(0.42);
    const content = 'Test IMSBC section';
    const metadata = '{"section":"A","page":5}';

    const stmt = db.prepare('INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    stmt.run(embedding768, content, metadata);

    const rows = db.prepare('SELECT rowid, content, metadata FROM imsbc_vec WHERE rowid = 1').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe(content);
    expect(rows[0].metadata).toBe(metadata);
  });

  // Acceptance: down() removes all 3 tables
  it('removes all 3 vec tables after down()', () => {
    migration018.up(db);
    migration018.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_vec'").all() as any[];
    expect(tables).toHaveLength(0);
  });
});
