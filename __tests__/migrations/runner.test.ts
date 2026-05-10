import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations, getAppliedVersions, ensureMigrationsTable } from '../../lib/migrations/runner';
import type { Migration } from '../../lib/migrations/types';

function makeInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  return db;
}

function makeMigrations(count: number): { migrations: Migration[]; callCounts: number[] } {
  const callCounts: number[] = Array(count).fill(0);
  const migrations: Migration[] = Array.from({ length: count }, (_, i) => ({
    version: i + 1,
    name: `migration_${i + 1}`,
    up: (db: Database.Database) => {
      callCounts[i]++;
      db.exec(`CREATE TABLE IF NOT EXISTS test_table_${i + 1} (id INTEGER PRIMARY KEY)`);
    },
    down: (db: Database.Database) => {
      db.exec(`DROP TABLE IF EXISTS test_table_${i + 1}`);
    },
  }));
  return { migrations, callCounts };
}

describe('runMigrations — idempotency', () => {
  test('second call is a no-op and does not throw', () => {
    const db = makeInMemoryDb();
    const { migrations } = makeMigrations(2);

    expect(() => runMigrations(db, migrations)).not.toThrow();
    expect(() => runMigrations(db, migrations)).not.toThrow();
  });

  test('each migration.up() is called exactly once even if runner is invoked 3 times', () => {
    const db = makeInMemoryDb();
    const { migrations, callCounts } = makeMigrations(3);

    runMigrations(db, migrations);
    runMigrations(db, migrations);
    runMigrations(db, migrations);

    expect(callCounts).toEqual([1, 1, 1]);
  });

  test('schema_migrations contains exactly N rows after N migrations × 3 runner calls', () => {
    const db = makeInMemoryDb();
    const N = 4;
    const { migrations } = makeMigrations(N);

    runMigrations(db, migrations);
    runMigrations(db, migrations);
    runMigrations(db, migrations);

    ensureMigrationsTable(db);
    const versions = getAppliedVersions(db);
    expect(versions).toHaveLength(N);
    expect(versions).toEqual([1, 2, 3, 4]);
  });

  test('single call still applies all migrations', () => {
    const db = makeInMemoryDb();
    const { migrations, callCounts } = makeMigrations(3);

    runMigrations(db, migrations);

    expect(callCounts).toEqual([1, 1, 1]);
    const versions = getAppliedVersions(db);
    expect(versions).toHaveLength(3);
  });
});
