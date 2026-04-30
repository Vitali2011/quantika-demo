/**
 * Minimal notification persistence helper.
 *
 * Writes a notification record to the `notifications` table.
 * The table is created by migration 009-pipedrive-tables.
 */

import type Database from 'better-sqlite3';

export interface NotificationRecord {
  source: string;
  event: string;
  payload: string;
}

/**
 * Insert a notification row into the DB.
 *
 * @param db   - An open better-sqlite3 Database instance.
 * @param data - The notification data to persist.
 */
export function writeNotification(db: Database.Database, data: NotificationRecord): void {
  db.prepare<[string, string, string, number]>(
    'INSERT INTO notifications (source, event, payload, created_at) VALUES (?, ?, ?, ?)'
  ).run(data.source, data.event, data.payload, Date.now());
}
