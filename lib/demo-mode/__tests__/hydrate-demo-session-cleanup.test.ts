/**
 * Wiring test — hydrateDemoSession prunes orphan per-session match copies.
 *
 * hydrateDemoSession runs on every DEMO_MODE login. It must call
 * deleteOrphanSessionMatches so the served demo-seed.db does not accumulate
 * ~436 match rows per login (copies left by sessions that have ended). Seeded
 * snapshot rows (user_id IS NULL) and live-session copies must survive.
 *
 * The session-store singleton is faked so hydrate operates on an in-memory db.
 */
import Database from 'better-sqlite3';

let mockDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: () => ({
    getDatabase: () => mockDb,
    updateSession: () => true,
  }),
}));

import { hydrateDemoSession } from '@/lib/demo-mode/hydrate-demo-session';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, access_token TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE emails (account_id TEXT, gmail_message_id TEXT, thread_id TEXT, from_addr TEXT, from_name TEXT, from_email TEXT, to_addr TEXT, subject TEXT, date TEXT, body TEXT, snippet TEXT, label_ids TEXT, fetched_at INTEGER);
    CREATE TABLE parsed_results (account_id TEXT, gmail_message_id TEXT, parse_type TEXT, parser_version TEXT, result_json TEXT, parsed_at INTEGER);
    CREATE TABLE matches (id INTEGER PRIMARY KEY, cargo_id TEXT, vessel_id TEXT, score INTEGER, reason TEXT, status TEXT, user_id TEXT, created_at INTEGER, updated_at INTEGER, reason_structured TEXT);
  `);
  // one email so buildDemoSessionBlob does not warn about an empty snapshot
  db.prepare(`INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email, to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES ('demo','e1','t1','A <a@demo.local>','A','a@demo.local','me@demo.local','S','2026-05-20','b','s','["INBOX"]',0)`).run();
  return db;
}

function countMatches(db: Database.Database, where = ''): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM matches ${where}`).get() as { n: number }).n;
}

function insertMatch(db: Database.Database, cargo: string, vessel: string, userId: string | null): void {
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured)
    VALUES (?, ?, 88, 'r', 'shortlist', ?, 0, 0, NULL)`).run(cargo, vessel, userId);
}

beforeEach(() => { mockDb = makeDb(); });
afterEach(() => { mockDb.close(); });

describe('hydrateDemoSession — orphan-copy cleanup', () => {
  it('prunes copies of ended sessions, keeps live-session copies and the seeded snapshot', () => {
    mockDb.prepare('INSERT INTO sessions (id, access_token, created_at, expires_at, data) VALUES (?,?,?,?,?)')
      .run('live-1', 'demo-seed', Date.now(), Date.now() + 3_600_000, '{}');
    insertMatch(mockDb, 'e1', 'e2', null);     // seeded snapshot
    insertMatch(mockDb, 'e1', 'e2', 'live-1'); // live session copy
    insertMatch(mockDb, 'e1', 'e2', 'dead-2'); // ended session copy (no sessions row)
    insertMatch(mockDb, 'e3', 'e4', 'dead-2'); // ended session copy

    hydrateDemoSession('live-1');

    expect(countMatches(mockDb, "WHERE user_id = 'dead-2'")).toBe(0); // orphans pruned
    expect(countMatches(mockDb, "WHERE user_id = 'live-1'")).toBe(1); // live preserved
    expect(countMatches(mockDb, 'WHERE user_id IS NULL')).toBe(1);    // seed preserved
  });
});
