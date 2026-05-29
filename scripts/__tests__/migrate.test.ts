import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { migrateDatabase, resolveDbPath } from '@/scripts/migrate';

function countApplied(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number }).c;
  } finally {
    db.close();
  }
}

describe('scripts/migrate — eager schema migration against the configured DB path', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-migrate-'));
    dbPath = path.join(tmpDir, 'served.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('brings a DB that is one migration behind up to the latest (the #677 latent bug)', () => {
    // Arrange: apply every migration EXCEPT the last → reproduces "served DB ships 1 behind".
    const behind = allMigrations.slice(0, -1);
    const seed = new Database(dbPath);
    sqliteVec.load(seed);
    runMigrations(seed, behind);
    seed.close();
    expect(countApplied(dbPath)).toBe(allMigrations.length - 1);

    // Act
    const result = migrateDatabase(dbPath);

    // Assert: fully caught up, nothing left unapplied.
    expect(result.total).toBe(allMigrations.length);
    expect(result.applied).toBe(allMigrations.length);
    expect(result.unapplied).toEqual([]);
    expect(countApplied(dbPath)).toBe(allMigrations.length);
  });

  it('is idempotent on an already-current DB (safe to run on every deploy)', () => {
    migrateDatabase(dbPath); // fresh DB → applies all
    const result = migrateDatabase(dbPath); // run again
    expect(result.unapplied).toEqual([]);
    expect(result.applied).toBe(allMigrations.length);
  });

  it('migrates the EXACT path it is given, not the default sessions.db', () => {
    const served = path.join(tmpDir, 'demo-seed.db');
    migrateDatabase(served);
    expect(fs.existsSync(served)).toBe(true);
    expect(countApplied(served)).toBe(allMigrations.length);
    // default-named db in the same dir must remain untouched
    expect(fs.existsSync(path.join(tmpDir, 'sessions.db'))).toBe(false);
  });
});

describe('resolveDbPath — env resolution (guards the #677 silent ghost-DB class)', () => {
  const ORIGINAL = process.env.SESSIONS_DB_PATH;
  const DEFAULT = path.join(process.cwd(), 'data', 'sessions.db');

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SESSIONS_DB_PATH;
    else process.env.SESSIONS_DB_PATH = ORIGINAL;
  });

  it('falls back to the default when SESSIONS_DB_PATH is unset', () => {
    delete process.env.SESSIONS_DB_PATH;
    expect(resolveDbPath()).toBe(DEFAULT);
  });

  it('falls back to the default when SESSIONS_DB_PATH is empty — not a ghost "" db (MED-1)', () => {
    process.env.SESSIONS_DB_PATH = '';
    expect(resolveDbPath()).toBe(DEFAULT);
  });

  it('uses a relative SESSIONS_DB_PATH as-is', () => {
    process.env.SESSIONS_DB_PATH = 'data/demo-seed.db';
    expect(resolveDbPath()).toBe('data/demo-seed.db');
  });

  it('uses an absolute SESSIONS_DB_PATH as-is', () => {
    process.env.SESSIONS_DB_PATH = '/srv/quantika/demo-seed.db';
    expect(resolveDbPath()).toBe('/srv/quantika/demo-seed.db');
  });
});
