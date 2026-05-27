import Database from 'better-sqlite3';
import migration039 from '../039-demo-seed-meta';

describe('migration 039 — demo_seed_meta', () => {
  function freshDb(): Database.Database {
    const db = new Database(':memory:');
    migration039.up(db);
    return db;
  }

  it('creates table with frozen_date, manifest_hash, generated_at columns', () => {
    const db = freshDb();
    const cols = db.prepare("PRAGMA table_info(demo_seed_meta)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['frozen_date', 'manifest_hash', 'generated_at']));
  });

  it('seeds zero rows by default', () => {
    const db = freshDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM demo_seed_meta').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('rejects inserting a second row (id CHECK constraint)', () => {
    const db = freshDb();
    db.prepare(
      "INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, '2026-05-20', 'abc')"
    ).run();
    expect(() => {
      db.prepare(
        "INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (2, '2026-05-21', 'def')"
      ).run();
    }).toThrow();
  });
});
