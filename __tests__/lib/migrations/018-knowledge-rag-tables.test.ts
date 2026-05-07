import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration018 from '@/lib/migrations/018-knowledge-rag-vec-tables';

describe('migration 018 knowledge-rag-tables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Load sqlite-vec extension (required for vec0 virtual tables)
    // Same pattern as lib/db/index.ts
    sqliteVec.load(db);
  });

  afterEach(() => db.close());

  describe('table existence', () => {
    it('creates imsbc_vec virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('imsbc_vec');
    });

    it('creates igc_vec virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('igc_vec');
    });

    it('creates jwc_vec virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('jwc_vec');
    });

    it('creates imsbc_fts virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('imsbc_fts');
    });

    it('creates igc_fts virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('igc_fts');
    });

    it('creates jwc_fts virtual table', () => {
      migration018.up(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.map((t) => t.name)).toContain('jwc_fts');
    });
  });

  describe('vec0 Float32Array[768] insertion', () => {
    it('accepts INSERT with Float32Array[768] embedding into imsbc_vec', () => {
      migration018.up(db);

      const embedding = new Float32Array(768);
      for (let i = 0; i < 768; i++) {
        embedding[i] = Math.random();
      }

      const stmt = db.prepare(`
        INSERT INTO imsbc_vec (embedding, content, metadata)
        VALUES (?, ?, ?)
      `);

      expect(() => {
        stmt.run(embedding, 'SECTION 4.2 - Cargo moisture limits', '{"source":"imsbc","section":"4.2"}');
      }).not.toThrow();

      const row = db.prepare("SELECT rowid, content FROM imsbc_vec LIMIT 1").get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('SECTION 4.2 - Cargo moisture limits');
    });

    it('accepts INSERT with Float32Array[768] embedding into igc_vec', () => {
      migration018.up(db);

      const embedding = new Float32Array(768);
      for (let i = 0; i < 768; i++) {
        embedding[i] = i / 1000.0;
      }

      const stmt = db.prepare(`
        INSERT INTO igc_vec (embedding, content, metadata)
        VALUES (?, ?, ?)
      `);

      expect(() => {
        stmt.run(embedding, 'WHEAT stowage requirements', '{"source":"igc","cargo":"wheat"}');
      }).not.toThrow();

      const row = db.prepare("SELECT rowid, content FROM igc_vec LIMIT 1").get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('WHEAT stowage requirements');
    });

    it('rejects INSERT with wrong dimension Float32Array[512] into jwc_vec', () => {
      migration018.up(db);

      const embedding = new Float32Array(512); // Wrong dimension
      for (let i = 0; i < 512; i++) {
        embedding[i] = Math.random();
      }

      const stmt = db.prepare(`
        INSERT INTO jwc_vec (embedding, content, metadata)
        VALUES (?, ?, ?)
      `);

      expect(() => {
        stmt.run(embedding, 'JWC Bulletin content', '{"source":"jwc"}');
      }).toThrow();
    });

    it('rejects INSERT with null embedding into imsbc_vec', () => {
      migration018.up(db);

      const stmt = db.prepare(`
        INSERT INTO imsbc_vec (embedding, content, metadata)
        VALUES (?, ?, ?)
      `);

      expect(() => {
        stmt.run(null, 'Some content', '{}');
      }).toThrow();
    });
  });

  describe('FTS5 full-text search', () => {
    it('accepts INSERT and returns row on search in imsbc_fts', () => {
      migration018.up(db);

      db.prepare(`
        INSERT INTO imsbc_fts (content, metadata)
        VALUES (?, ?)
      `).run('IMSBC Code Section 4 discusses cargo moisture limits for Group A cargoes', '{"source":"imsbc","section":"4"}');

      const results = db.prepare(`
        SELECT rowid, content, rank
        FROM imsbc_fts
        WHERE imsbc_fts MATCH 'moisture'
        ORDER BY rank
        LIMIT 5
      `).all() as any[];

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('moisture');
    });

    it('accepts INSERT and returns row on search in igc_fts', () => {
      migration018.up(db);

      db.prepare(`
        INSERT INTO igc_fts (content, metadata)
        VALUES (?, ?)
      `).run('IGC Chapter 3 covers grain trimming procedures for wheat and barley', '{"source":"igc","chapter":"3"}');

      const results = db.prepare(`
        SELECT rowid, content, rank
        FROM igc_fts
        WHERE igc_fts MATCH 'wheat'
        ORDER BY rank
        LIMIT 5
      `).all() as any[];

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('wheat');
    });

    it('accepts INSERT and returns row on search in jwc_fts', () => {
      migration018.up(db);

      db.prepare(`
        INSERT INTO jwc_fts (content, metadata)
        VALUES (?, ?)
      `).run('JWC Bulletin 2024-05 lists Red Sea as high-risk war zone', '{"source":"jwc","bulletin":"2024-05"}');

      const results = db.prepare(`
        SELECT rowid, content, rank
        FROM jwc_fts
        WHERE jwc_fts MATCH 'Red Sea'
        ORDER BY rank
        LIMIT 5
      `).all() as any[];

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('Red Sea');
    });

    it('throws on empty query string in imsbc_fts (FTS5 behavior)', () => {
      migration018.up(db);

      db.prepare(`
        INSERT INTO imsbc_fts (content, metadata)
        VALUES (?, ?)
      `).run('Some content', '{}');

      // FTS5 MATCH with empty string is a syntax error
      // Application layer must guard against this before querying
      expect(() => {
        db.prepare(`
          SELECT rowid, content
          FROM imsbc_fts
          WHERE imsbc_fts MATCH ''
        `).all();
      }).toThrow(/syntax error/);
    });
  });

  describe('rollback', () => {
    it('rolls back cleanly via down()', () => {
      migration018.up(db);
      migration018.down(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).not.toContain('imsbc_vec');
      expect(tableNames).not.toContain('igc_vec');
      expect(tableNames).not.toContain('jwc_vec');
      expect(tableNames).not.toContain('imsbc_fts');
      expect(tableNames).not.toContain('igc_fts');
      expect(tableNames).not.toContain('jwc_fts');
    });
  });

  describe('idempotency', () => {
    it('is idempotent (up() can run multiple times safely)', () => {
      migration018.up(db);
      expect(() => migration018.up(db)).not.toThrow();

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('imsbc_vec');
      expect(tableNames).toContain('imsbc_fts');
    });
  });

  describe('input contract — boundary conditions', () => {
    it('handles down() on unmigrated db (no-op)', () => {
      // Fresh db, never migrated
      expect(() => migration018.down(db)).not.toThrow();

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      expect(tables.length).toBe(0);
    });
  });
});
