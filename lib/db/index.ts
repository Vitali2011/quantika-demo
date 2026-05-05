import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'path';

const DEFAULT_DB_PATH =
  process.env.SESSIONS_DB_PATH ?? path.join(process.cwd(), 'data', 'sessions.db');

/**
 * Initialize and return a SQLite database connection with sqlite-vec extension loaded.
 *
 * CRITICAL: sqlite-vec.load() MUST be called BEFORE migrations run, so that
 * future migrations can safely use vec0 virtual tables.
 *
 * @param dbPath - Path to SQLite database file (defaults to SESSIONS_DB_PATH env var or data/sessions.db)
 * @returns Database instance with sqlite-vec extension loaded
 */
export function getDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  return db;
}
