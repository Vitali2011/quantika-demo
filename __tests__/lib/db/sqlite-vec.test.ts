import { getDb } from '@/lib/db';

describe('sqlite-vec extension', () => {
  it('should load sqlite-vec extension and support vec0 virtual table creation', () => {
    const db = getDb();

    // This should succeed if sqlite-vec is loaded
    expect(() => {
      db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec USING vec0(embedding FLOAT[768])').run();
    }).not.toThrow();

    // Verify table was created
    const tableInfo = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='test_vec'")
      .get();
    expect(tableInfo?.name).toBe('test_vec');

    // Clean up
    db.prepare('DROP TABLE IF EXISTS test_vec').run();
    db.close();
  });

  it('should support vec0 with different dimensions (FLOAT[1536])', () => {
    const db = getDb();

    // Create table with different dimension
    expect(() => {
      db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec_1536 USING vec0(embedding FLOAT[1536])').run();
    }).not.toThrow();

    // Clean up
    db.prepare('DROP TABLE IF EXISTS test_vec_1536').run();
    db.close();
  });

  it('should work with :memory: databases', () => {
    const Database = require('better-sqlite3');
    const sqliteVec = require('sqlite-vec');

    const db = new Database(':memory:');
    sqliteVec.load(db);

    expect(() => {
      db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS mem_vec USING vec0(embedding FLOAT[768])').run();
    }).not.toThrow();

    db.close();
  });

  it('should be idempotent when getDb is called multiple times', () => {
    const db1 = getDb();
    const db2 = getDb();

    // Both should work
    expect(() => {
      db1.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec_1 USING vec0(embedding FLOAT[768])').run();
    }).not.toThrow();

    expect(() => {
      db2.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec_2 USING vec0(embedding FLOAT[768])').run();
    }).not.toThrow();

    // Clean up
    db1.prepare('DROP TABLE IF EXISTS test_vec_1').run();
    db2.prepare('DROP TABLE IF EXISTS test_vec_2').run();
    db1.close();
    // Don't close db2 if it's the same instance, otherwise it's already closed
    if (db2 !== db1) {
      db2.close();
    }
  });
});
