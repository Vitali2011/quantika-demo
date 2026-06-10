import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'path';

const DEFAULT_DB_PATH =
  process.env.SESSIONS_DB_PATH ?? path.join(process.cwd(), 'data', 'sessions.db');

const _cache = new Map<string, Database.Database>();

/**
 * Return a cached singleton SQLite connection for the given path.
 * sqlite-vec is loaded once per connection. WAL mode and busy_timeout are
 * applied at open time so concurrent readers/writers never get SQLITE_BUSY.
 *
 * NOTE: `:memory:` databases are NOT shared — each call returns a new
 * in-memory database (required for test isolation).
 */
export function getDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  if (dbPath === ':memory:') {
    const db = new Database(':memory:');
    sqliteVec.load(db);
    return db;
  }

  const resolved = path.resolve(dbPath);
  const cached = _cache.get(resolved);
  if (cached && cached.open) {
    return cached;
  }

  const db = new Database(resolved);
  sqliteVec.load(db);
  const walMode = db.pragma('journal_mode = WAL', { simple: true }) as string;
  if (walMode !== 'wal') console.warn('[getDb] WAL not enabled for', resolved, '— got', walMode);
  db.pragma('busy_timeout = 5000');
  _cache.set(resolved, db);
  return db;
}
