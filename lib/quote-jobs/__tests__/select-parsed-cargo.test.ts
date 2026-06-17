import Database from 'better-sqlite3';
import type { ParsedCargo } from '@/lib/types';
import { selectParsedCargo } from '../../../scripts/quote-workshop/worker';

// #1034: a multi-cargo email has several parsedCargos that share one emailId,
// distinguished only by itemIndex. The worker must pick the cargo that the JOB's
// match is actually for (match.cargo_item_index), NOT just the first item.

function buildMatchesDb(cargoItemIndex: number | null): {
  db: Database.Database;
  matchId: string;
} {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cargo_id TEXT NOT NULL DEFAULT '',
      vessel_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      cargo_item_index INTEGER,
      vessel_item_index INTEGER
    )
  `);
  const r = db
    .prepare(`INSERT INTO matches (cargo_item_index, vessel_item_index) VALUES (?, 0)`)
    .run(cargoItemIndex);
  return { db, matchId: String(r.lastInsertRowid) };
}

const EMAIL = 'email-X';

function cargo(itemIndex: number, dest: string, weightMt: number): ParsedCargo {
  return {
    emailId: EMAIL,
    itemIndex,
    destinationPort: { value: dest, confidence: 'high' },
    weightMt: { value: weightMt, confidence: 'high' },
  } as unknown as ParsedCargo;
}

// item0 = Djibouti/Tadjourah ~8500 MT sibling; item1 = Berbera 2800 MT.
const item0 = cargo(0, 'Djibouti', 8500);
const item1 = cargo(1, 'Berbera', 2800);
const session = { parsedCargos: [item0, item1] };

it('picks the Berbera 2800 cargo (itemIndex=1) when the match is for item 1', () => {
  const { db, matchId } = buildMatchesDb(1);
  const job = { email_id: EMAIL, match_id: matchId, session_id: 's1' };
  const picked = selectParsedCargo(db, session, job);
  expect(picked).toBe(item1);
  expect(picked!.itemIndex).toBe(1);
  expect(picked!.destinationPort!.value).toBe('Berbera');
  expect(picked!.weightMt!.value).toBe(2800);
});

it('picks item 0 when the match is for item 0', () => {
  const { db, matchId } = buildMatchesDb(0);
  const job = { email_id: EMAIL, match_id: matchId, session_id: 's1' };
  const picked = selectParsedCargo(db, session, job);
  expect(picked).toBe(item0);
  expect(picked!.itemIndex).toBe(0);
});

it('falls back to item 0 when the job has no numeric match_id', () => {
  const { db } = buildMatchesDb(1);
  const job = { email_id: EMAIL, match_id: null, session_id: 's1' };
  const picked = selectParsedCargo(db, session, job);
  expect(picked).toBe(item0);
});

it('returns undefined when no parsedCargo matches the resolved item index', () => {
  const { db, matchId } = buildMatchesDb(5);
  const job = { email_id: EMAIL, match_id: matchId, session_id: 's1' };
  expect(selectParsedCargo(db, session, job)).toBeUndefined();
});
