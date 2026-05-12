/**
 * RED tests for migration 029-bimco-rag (spec gamma-09)
 * Pattern: follows 018-knowledge-rag-vec-tables.test.ts
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration029 from '@/lib/migrations/029-bimco-rag';

describe('migration 029 bimco-rag', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Load sqlite-vec BEFORE migration runs (matches production behavior)
    sqliteVec.load(db);
  });

  afterEach(() => db.close());

  // TC-M29-01: dimension mismatch (384 instead of 768)
  it('rejects INSERT with wrong embedding dimension (384 instead of 768)', () => {
    migration029.up(db);
    const embedding384 = new Float32Array(384).fill(0.5);
    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding384, 'test content', '{"key":"value"}')).toThrow();
  });

  // TC-M29-02: empty content string
  it('accepts INSERT with empty content string', () => {
    migration029.up(db);
    const embedding768 = new Float32Array(768).fill(0.1);
    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, '', '{"key":"value"}')).not.toThrow();
  });

  // TC-M29-03: empty metadata string (NULL is rejected by vec0 TEXT)
  it('accepts INSERT with empty metadata string', () => {
    migration029.up(db);
    const embedding768 = new Float32Array(768).fill(0.2);
    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, 'content', '')).not.toThrow();
  });

  // TC-M29-04: invalid JSON metadata (no validation at DB level)
  it('accepts INSERT with invalid JSON metadata', () => {
    migration029.up(db);
    const embedding768 = new Float32Array(768).fill(0.3);
    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, 'content', 'not json')).not.toThrow();
  });

  // TC-M29-05: idempotent up()
  it('is idempotent — calling up() twice does not throw', () => {
    migration029.up(db);
    expect(() => migration029.up(db)).not.toThrow();
  });

  // TC-M29-06: down() on empty db
  it('down() succeeds on empty database (tables do not exist)', () => {
    // Do NOT call up() first — test down() on fresh db
    expect(() => migration029.down(db)).not.toThrow();
  });

  // Acceptance: verify tables exist after up()
  it('creates bimco_vec and bimco_fts virtual tables after up()', () => {
    migration029.up(db);
    const vecTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bimco_vec'").all() as any[];
    const ftsTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bimco_fts'").all() as any[];

    expect(vecTables).toHaveLength(1);
    expect(ftsTables).toHaveLength(1);
  });

  // Acceptance: INSERT valid embedding succeeds
  it('accepts INSERT with valid Float32Array[768] embedding', () => {
    migration029.up(db);
    const embedding768 = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      embedding768[i] = Math.random();
    }

    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    expect(() => stmt.run(embedding768, 'BIMCO clause content', '{"charterParty":"GENCON 2022"}')).not.toThrow();
  });

  // Acceptance: SELECT returns inserted row
  it('retrieves inserted row via SELECT with correct content and metadata', () => {
    migration029.up(db);
    const embedding768 = new Float32Array(768).fill(0.42);
    const content = 'Clause 1: Vessel Name';
    const metadata = '{"charterParty":"GENCON 2022","clauseNumber":"1"}';

    const stmt = db.prepare('INSERT INTO bimco_vec (embedding, content, metadata) VALUES (?, ?, ?)');
    stmt.run(embedding768, content, metadata);

    const rows = db.prepare('SELECT rowid, content, metadata FROM bimco_vec WHERE rowid = 1').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe(content);
    expect(rows[0].metadata).toBe(metadata);
  });

  // Acceptance: FTS5 INSERT and SELECT
  it('supports FTS5 full-text search after up()', () => {
    migration029.up(db);
    const stmt = db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)');
    stmt.run('laytime and demurrage clause', '{"charterParty":"GENCON 2022"}');

    const rows = db.prepare("SELECT content FROM bimco_fts WHERE content MATCH 'laytime'").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('laytime');
  });

  // Acceptance: down() removes both tables
  it('removes bimco_vec and bimco_fts tables after down()', () => {
    migration029.up(db);
    migration029.down(db);

    const vecTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bimco_vec'").all() as any[];
    const ftsTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bimco_fts'").all() as any[];

    expect(vecTables).toHaveLength(0);
    expect(ftsTables).toHaveLength(0);
  });
});
