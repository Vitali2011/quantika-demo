import Database from 'better-sqlite3';
import type { Migration } from '../migrations/types';
import {
  ensureMigrationsTable,
  getAppliedVersions,
  runMigrations,
  getMigrationStatus,
} from '../migrations/runner';
import { allMigrations } from '../migrations/index';

// Helper: check whether a table exists in the given DB
function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(tableName);
  return row !== undefined;
}

// Helper: count rows in schema_migrations for a given version
function countVersion(db: Database.Database, version: number): number {
  const row = db
    .prepare<[number], { cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM schema_migrations WHERE version = ?'
    )
    .get(version);
  return row?.cnt ?? 0;
}

describe('migration runner', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // Test 1: Fresh DB → all migrations applied, sessions + audit_events tables exist
  it('applies allMigrations to a fresh DB and creates sessions + audit_events tables', () => {
    runMigrations(db, allMigrations);

    expect(tableExists(db, 'sessions')).toBe(true);
    expect(tableExists(db, 'audit_events')).toBe(true);
    expect(tableExists(db, 'schema_migrations')).toBe(true);

    const applied = getAppliedVersions(db);
    expect(applied).toContain(1);
    expect(applied).toContain(2);
    expect(applied).toHaveLength(allMigrations.length);
  });

  // Test 2: Pre-existing sessions table (no schema_migrations) → idempotent
  it('handles a DB where sessions already exists but schema_migrations does not', () => {
    // Manually create sessions table before running migrations
    db.exec(
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, access_token TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, data TEXT NOT NULL)'
    );

    // Must not throw; the migration uses CREATE TABLE IF NOT EXISTS
    expect(() => runMigrations(db, allMigrations)).not.toThrow();

    expect(tableExists(db, 'sessions')).toBe(true);
    expect(getAppliedVersions(db)).toContain(1);
  });

  // Test 3: Already-applied migration → skipped (idempotent)
  it('does not re-apply a migration that was already applied', () => {
    runMigrations(db, allMigrations);
    // Run again — should not throw and should not insert a duplicate row
    expect(() => runMigrations(db, allMigrations)).not.toThrow();

    const count = countVersion(db, 1);
    expect(count).toBe(1);
  });

  // Test 4: Multiple migrations applied in version order (even when provided out-of-order)
  it('applies multiple migrations in ascending version order', () => {
    const order: number[] = [];

    const migV3: Migration = {
      version: 3,
      name: 'v3',
      up(d) {
        order.push(3);
        d.exec('CREATE TABLE IF NOT EXISTS t3 (id INTEGER PRIMARY KEY)');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS t3');
      },
    };
    const migV1: Migration = {
      version: 1,
      name: 'v1',
      up(d) {
        order.push(1);
        d.exec('CREATE TABLE IF NOT EXISTS t1 (id INTEGER PRIMARY KEY)');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS t1');
      },
    };
    const migV2: Migration = {
      version: 2,
      name: 'v2',
      up(d) {
        order.push(2);
        d.exec('CREATE TABLE IF NOT EXISTS t2 (id INTEGER PRIMARY KEY)');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS t2');
      },
    };

    // Deliberately pass them out of order
    runMigrations(db, [migV3, migV1, migV2]);

    expect(order).toEqual([1, 2, 3]);

    const applied = getAppliedVersions(db);
    expect(applied).toEqual([1, 2, 3]);
  });

  // Test 5: Failed migration → transaction rolled back, version not recorded
  it('rolls back a failed migration and does not record its version', () => {
    const badMigration: Migration = {
      version: 99,
      name: 'bad-migration',
      up(d) {
        // Create a partial table first to simulate partial work
        d.exec('CREATE TABLE IF NOT EXISTS partial_table (id INTEGER PRIMARY KEY)');
        // Then throw to simulate a failure
        throw new Error('intentional migration failure');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS partial_table');
      },
    };

    expect(() => runMigrations(db, [badMigration])).toThrow('intentional migration failure');

    // The version must NOT be recorded
    expect(countVersion(db, 99)).toBe(0);

    // The partial table change should be rolled back
    expect(tableExists(db, 'partial_table')).toBe(false);
  });

  // Test 6: getMigrationStatus() returns correct applied/pending status
  it('getMigrationStatus returns correct applied and pending flags', () => {
    const migA: Migration = {
      version: 10,
      name: 'migration-a',
      up(d) {
        d.exec('CREATE TABLE IF NOT EXISTS ta (id INTEGER PRIMARY KEY)');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS ta');
      },
    };
    const migB: Migration = {
      version: 20,
      name: 'migration-b',
      up(d) {
        d.exec('CREATE TABLE IF NOT EXISTS tb (id INTEGER PRIMARY KEY)');
      },
      down(d) {
        d.exec('DROP TABLE IF EXISTS tb');
      },
    };

    // Apply only migA
    runMigrations(db, [migA]);

    const status = getMigrationStatus(db, [migA, migB]);

    expect(status).toHaveLength(2);

    const statusA = status.find((s) => s.version === 10);
    const statusB = status.find((s) => s.version === 20);

    expect(statusA).toBeDefined();
    expect(statusA?.applied).toBe(true);
    expect(statusA?.name).toBe('migration-a');

    expect(statusB).toBeDefined();
    expect(statusB?.applied).toBe(false);
    expect(statusB?.name).toBe('migration-b');
  });

  // Bonus test 7: ensureMigrationsTable is idempotent
  it('ensureMigrationsTable can be called multiple times without error', () => {
    expect(() => {
      ensureMigrationsTable(db);
      ensureMigrationsTable(db);
      ensureMigrationsTable(db);
    }).not.toThrow();

    expect(tableExists(db, 'schema_migrations')).toBe(true);
  });
});
