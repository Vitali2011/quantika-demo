import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { AuditEntry } from './types';
import { getStore } from './session-store';

// ── Serialization helpers ──────────────────────────────────────────────────

function serializeValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function deserializeValue(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ── Row shape returned by SQLite ───────────────────────────────────────────

interface AuditRow {
  id: string;
  timestamp: string;
  session_id: string;
  inquiry_id: string | null;
  actor: string;
  action: string;
  field: string | null;
  before_value: string | null;
  after_value: string | null;
  reason: string | null;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    ...(row.inquiry_id != null ? { inquiryId: row.inquiry_id } : {}),
    actor: row.actor as AuditEntry['actor'],
    action: row.action as AuditEntry['action'],
    ...(row.field != null ? { field: row.field } : {}),
    ...(row.before_value != null ? { beforeValue: deserializeValue(row.before_value) } : {}),
    ...(row.after_value != null ? { afterValue: deserializeValue(row.after_value) } : {}),
    ...(row.reason != null ? { reason: row.reason } : {}),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Logs a single audit event. Returns the persisted entry with id + timestamp.
 *
 * @param entry  Fields to record (id and timestamp are generated automatically)
 * @param db     Optional db override — defaults to the application singleton (for testing)
 */
export function logAuditEvent(
  entry: Omit<AuditEntry, 'id' | 'timestamp'>,
  db?: Database.Database,
): AuditEntry {
  const database = db ?? getStore().getDatabase();
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  database
    .prepare<[string, string, string, string | null, string, string, string | null, string | null, string | null, string | null]>(
      `INSERT INTO audit_events
         (id, timestamp, session_id, inquiry_id, actor, action, field, before_value, after_value, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      timestamp,
      entry.sessionId,
      entry.inquiryId ?? null,
      entry.actor,
      entry.action,
      entry.field ?? null,
      serializeValue(entry.beforeValue),
      serializeValue(entry.afterValue),
      entry.reason ?? null,
    );

  return { ...entry, id, timestamp };
}

/**
 * Returns all audit events for a given inquiry, ordered by timestamp ASC.
 *
 * @param inquiryId  The inquiry to fetch events for
 * @param db         Optional db override (for testing)
 */
export function getAuditTrail(
  inquiryId: string,
  db?: Database.Database,
): AuditEntry[] {
  const database = db ?? getStore().getDatabase();
  const rows = database
    .prepare<[string], AuditRow>(
      'SELECT * FROM audit_events WHERE inquiry_id = ? ORDER BY timestamp ASC, rowid ASC',
    )
    .all(inquiryId);
  return rows.map(rowToEntry);
}

/**
 * Returns audit events for a session, ordered by timestamp DESC (most recent first).
 *
 * @param sessionId  The session to fetch events for
 * @param limit      Maximum number of events to return (default 100)
 * @param db         Optional db override (for testing)
 */
export function getAuditTrailBySession(
  sessionId: string,
  limit = 100,
  db?: Database.Database,
): AuditEntry[] {
  const database = db ?? getStore().getDatabase();
  const rows = database
    .prepare<[string, number], AuditRow>(
      'SELECT * FROM audit_events WHERE session_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?',
    )
    .all(sessionId, limit);
  return rows.map(rowToEntry);
}
