/**
 * Behavioral tests — invalidateLiveSessions (Lane #1 stale-session durable fix).
 *
 * PI2: runs the real helper against a real in-memory better-sqlite3 DB. No impl mocks.
 * Proves a regen wipes per-session match copies + all sessions, while leaving the
 * fresh master (NULL) and sentinel buckets intact, so the next login re-hydrates clean.
 */
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { invalidateLiveSessions } from '../regenerate-matches';
import { buildDemoSessionBlob } from '@/lib/demo-mode/hydrate-demo-session';

function makeDb(): DB {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id TEXT, vessel_id TEXT, user_id TEXT,
      score REAL, reason TEXT, reason_structured TEXT,
      tce_usd_per_day REAL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, access_token TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE emails (
      gmail_message_id TEXT, thread_id TEXT, from_addr TEXT, from_name TEXT,
      from_email TEXT, to_addr TEXT, subject TEXT, date TEXT,
      body TEXT, snippet TEXT, label_ids TEXT
    );
    CREATE TABLE parsed_results (parse_type TEXT, result_json TEXT);
  `);
  const ins = db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, user_id, score, reason, reason_structured, tce_usd_per_day)
     VALUES (?,?,?,?,?,?,?)`,
  );
  // master (NULL) — fresh, must survive
  ins.run('c1', 'v1', null, 0.85, null, null, 9586);
  ins.run('c2', 'v2', null, 0.80, null, null, 9000);
  // sentinels — must survive
  ins.run('c3', 'v3', '__demo_review__', 0.5, null, null, 2977);
  ins.run('c4', 'v4', '__demo_insufficient__', 0.3, null, null, 3906);
  // per-session UUID copies — must be deleted
  ins.run('c1', 'v1', 'sess-aaaa', 0.85, null, null, -308);
  ins.run('c2', 'v2', 'sess-bbbb', 0.80, null, null, -943);
  // sessions rows — must be deleted
  const sIns = db.prepare(
    `INSERT INTO sessions (id, access_token, created_at, expires_at, data) VALUES (?,?,?,?,?)`,
  );
  sIns.run('sess-aaaa', 'tok', 1, 9_999_999_999_999, '{}');
  sIns.run('sess-bbbb', 'tok', 1, 9_999_999_999_999, '{}');
  return db;
}

describe('invalidateLiveSessions', () => {
  it('deletes per-session UUID match copies, keeps master (NULL) + sentinels', () => {
    const db = makeDb();
    invalidateLiveSessions(db);

    const nullCount = db
      .prepare(`SELECT COUNT(*) n FROM matches WHERE user_id IS NULL`)
      .get() as { n: number };
    const sentinels = db
      .prepare(
        `SELECT COUNT(*) n FROM matches WHERE user_id IN ('__demo_review__','__demo_insufficient__')`,
      )
      .get() as { n: number };
    const sessionCopies = db
      .prepare(
        `SELECT COUNT(*) n FROM matches WHERE user_id IS NOT NULL
           AND user_id NOT IN ('__demo_review__','__demo_insufficient__')`,
      )
      .get() as { n: number };

    expect(nullCount.n).toBe(2);
    expect(sentinels.n).toBe(2);
    expect(sessionCopies.n).toBe(0);
  });

  it('empties the sessions table (force re-hydration on next login)', () => {
    const db = makeDb();
    invalidateLiveSessions(db);
    const sess = db.prepare(`SELECT COUNT(*) n FROM sessions`).get() as { n: number };
    expect(sess.n).toBe(0);
  });

  it('is a no-op-safe second call (idempotent — re-running regen is fine)', () => {
    const db = makeDb();
    invalidateLiveSessions(db);
    expect(() => invalidateLiveSessions(db)).not.toThrow();
    const sess = db.prepare(`SELECT COUNT(*) n FROM sessions`).get() as { n: number };
    expect(sess.n).toBe(0);
  });

  it('after invalidation, buildDemoSessionBlob still returns the fresh master (no empty state)', () => {
    const db = makeDb();
    invalidateLiveSessions(db);

    const blob = buildDemoSessionBlob(db);
    expect(blob.matches.length).toBe(2);
    expect(blob.matches.every((m) => (m.economics?.tceUsdPerDay ?? 0) > 0)).toBe(true);
  });
});
