import type Database from 'better-sqlite3';

export interface DispatchRecord {
  deal_id: string;
  deadline_id: string;
  stage: string;
  channel: string;
  notified_at: number;
}

let _db: Database.Database | null = null;

/**
 * Set the database instance used by this module.
 * Must be called before tryRecordDispatch / listDispatches.
 */
export function setDb(db: Database.Database): void {
  _db = db;
}

function getDb(): Database.Database {
  if (!_db) {
    throw new Error('[dispatches] DB not initialised — call setDb() first');
  }
  return _db;
}

/**
 * Try to insert a dispatch record.
 * Returns true if a new row was inserted (first dispatch),
 * false if the row already existed (duplicate).
 */
export function tryRecordDispatch(
  deal_id: string,
  deadline_id: string,
  stage: string,
  channel: string,
): boolean {
  const db = getDb();
  const result = db
    .prepare<[string, string, string, string, number]>(
      `INSERT OR IGNORE INTO notified_dispatches
         (deal_id, deadline_id, stage, channel, notified_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(deal_id, deadline_id, stage, channel, Date.now());
  return result.changes > 0;
}

/**
 * List all dispatch records for a given deal + deadline combination.
 */
export function listDispatches(
  deal_id: string,
  deadline_id: string,
): DispatchRecord[] {
  const db = getDb();
  return db
    .prepare<[string, string], DispatchRecord>(
      `SELECT deal_id, deadline_id, stage, channel, notified_at
       FROM notified_dispatches
       WHERE deal_id = ? AND deadline_id = ?`,
    )
    .all(deal_id, deadline_id);
}
