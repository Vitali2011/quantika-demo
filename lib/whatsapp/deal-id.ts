import type Database from 'better-sqlite3';
import { getStore } from '../session-store';

export function formatDealId(numericId: number): string {
  return `D-${numericId}`;
}

export function parseDealId(s: string): number | null {
  const match = s.match(/^[Dd]-?(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export async function assignNextDealId(
  sessionId: string,
  getDb?: () => Database.Database,
): Promise<string> {
  const db = getDb ? getDb() : getStore().getDatabase();

  const existing = db
    .prepare<[string], { last_id: number }>('SELECT last_id FROM deal_id_counter WHERE session_id = ?')
    .get(sessionId);

  const nextId = (existing?.last_id ?? 0) + 1;

  db.prepare<[string, number]>(`
    INSERT INTO deal_id_counter (session_id, last_id) VALUES (?, ?)
    ON CONFLICT(session_id) DO UPDATE SET last_id = excluded.last_id
  `).run(sessionId, nextId);

  return formatDealId(nextId);
}
