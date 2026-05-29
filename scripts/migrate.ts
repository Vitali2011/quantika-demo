/**
 * migrate.ts — eager schema migration for deploy (#677).
 *
 * Runs every registered migration against the RUNTIME-configured database
 * (`SESSIONS_DB_PATH`, which in DEMO_MODE is the served `data/demo-seed.db`),
 * so the database that is actually served is guaranteed up-to-date at deploy
 * time. This removes the dependency on the fragile, error-swallowing lazy
 * first-request migration path (the latent root cause behind #677: a frozen
 * snapshot or sessions DB silently shipping one migration behind).
 *
 * Doubles as the deploy verify step: after applying, it asserts every
 * registered migration is present and exits non-zero (loud failure) if not.
 *
 * Usage:
 *   SESSIONS_DB_PATH=data/demo-seed.db npx tsx scripts/migrate.ts
 *   # or, default: data/sessions.db
 */
import * as path from 'path';
import { getDb } from '@/lib/db';
import { runMigrations, getMigrationStatus } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

export interface MigrateResult {
  dbPath: string;
  total: number;
  applied: number;
  unapplied: number[];
}

/**
 * Resolve the database path the running app would use — identical resolution
 * to lib/session-store.ts and lib/db so the deploy migrates exactly the DB
 * the app serves.
 */
export function resolveDbPath(): string {
  // `||` (not `??`): an empty SESSIONS_DB_PATH must fall back to the default,
  // otherwise migrate.ts would silently migrate a ghost "" database and report
  // success while the real served DB stays behind — the exact #677 failure class.
  return process.env.SESSIONS_DB_PATH || path.join(process.cwd(), 'data', 'sessions.db');
}

/**
 * Apply all pending migrations to the database at `dbPath`, then verify
 * completeness. Returns the resulting status. Does not throw on incomplete
 * schema — the caller (CLI) decides how to react.
 */
export function migrateDatabase(dbPath: string): MigrateResult {
  const db = getDb(dbPath); // loads sqlite-vec before migrations (vec0 tables in 018+)
  try {
    runMigrations(db, allMigrations);
    const status = getMigrationStatus(db, allMigrations);
    const unapplied = status.filter((s) => !s.applied).map((s) => s.version);
    return {
      dbPath,
      total: allMigrations.length,
      applied: status.length - unapplied.length,
      unapplied,
    };
  } finally {
    db.close();
  }
}

function main(): void {
  const dbPath = resolveDbPath();
  console.log(`[migrate] target db: ${dbPath}`);
  const result = migrateDatabase(dbPath);
  if (result.unapplied.length > 0) {
    console.error(
      `[migrate] FAILED — ${result.unapplied.length} migration(s) unapplied: ${result.unapplied.join(', ')}`
    );
    process.exit(1);
  }
  console.log(`[migrate] OK — ${result.applied}/${result.total} migrations applied`);
}

if (require.main === module) {
  main();
}
