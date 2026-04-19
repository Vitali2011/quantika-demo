import type Database from 'better-sqlite3';
import type { Migration, MigrationRecord } from './types';

export function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

export function getAppliedVersions(db: Database.Database): number[] {
  const rows = db
    .prepare<[], Pick<MigrationRecord, 'version'>>('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  return rows.map((r) => r.version);
}

export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  ensureMigrationsTable(db);
  const applied = new Set(getAppliedVersions(db));

  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db);
      db.prepare<[number, string, number]>(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, Date.now());
    })();
  }
}

export function getMigrationStatus(
  db: Database.Database,
  migrations: Migration[]
): Array<{ version: number; name: string; applied: boolean }> {
  ensureMigrationsTable(db);
  const applied = new Set(getAppliedVersions(db));

  return migrations
    .slice()
    .sort((a, b) => a.version - b.version)
    .map((m) => ({ version: m.version, name: m.name, applied: applied.has(m.version) }));
}
