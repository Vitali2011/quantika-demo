/**
 * Regression test: dedup + grainCapacityUnit normalization in buildDemoSessionBlob.
 *
 * Three parsed_results rows for the same emailId|itemIndex vessel must collapse to
 * one record (first-wins). Display path and scoring path must resolve to the same
 * record. grainCapacityUnit must be 'cbm' and grainCapacity must be the first-row
 * value (3994), eliminating the false "overflows the holds" for HRC at 115 MT.
 */
import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '../hydrate-demo-session';
import { scoreVolume } from '@/lib/sailing/fit-breakdown';

const EMAIL_ID = '19e07aabbccddee';
const ITEM_INDEX = 1;

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE emails (
      account_id TEXT, gmail_message_id TEXT, thread_id TEXT, from_addr TEXT,
      from_name TEXT, from_email TEXT, to_addr TEXT, subject TEXT, date TEXT,
      body TEXT, snippet TEXT, label_ids TEXT, fetched_at INTEGER
    );
    CREATE TABLE parsed_results (
      account_id TEXT, gmail_message_id TEXT, parse_type TEXT, parser_version TEXT,
      result_json TEXT, parsed_at INTEGER
    );
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY, cargo_id TEXT, vessel_id TEXT, score INTEGER,
      reason TEXT, status TEXT, user_id TEXT, created_at INTEGER, updated_at INTEGER,
      reason_structured TEXT
    );
  `);

  db.prepare(`INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email, to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES ('demo',?,?,?,?,?,'me@demo.local','Vessel YUCATAN','2026-05-20','body','snip','["INBOX"]',0)`)
    .run(EMAIL_ID, `t-${EMAIL_ID}`, `Sender <sender@demo.local>`, 'Sender', 'sender@demo.local');

  // Three duplicate rows for the same emailId|itemIndex: first has correct cbft value that maps
  // to 3994 cbm; second and third carry a previously-double-converted 113 cbm value.
  const row1 = JSON.stringify([{
    emailId: EMAIL_ID, itemIndex: ITEM_INDEX,
    vesselName: 'YUCATAN', grainCapacity: 3994, grainCapacityUnit: 'cbft',
    dwt: 3176,
  }]);
  const row2 = JSON.stringify([{
    emailId: EMAIL_ID, itemIndex: ITEM_INDEX,
    vesselName: 'YUCATAN', grainCapacity: 113, grainCapacityUnit: 'cbm',
    dwt: 3176,
  }]);
  const row3 = JSON.stringify([{
    emailId: EMAIL_ID, itemIndex: ITEM_INDEX,
    vesselName: 'YUCATAN', grainCapacity: 113, grainCapacityUnit: 'cbm',
    dwt: 3176,
  }]);

  const ins = db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at) VALUES ('demo',?,?,?,?,?)`);
  ins.run(EMAIL_ID, 'vessel', 'v1', row1, 0);
  ins.run(EMAIL_ID, 'vessel', 'v1', row2, 0);
  ins.run(EMAIL_ID, 'vessel', 'v1', row3, 0);

  return db;
}

describe('buildDemoSessionBlob — dedup + unit normalization (#884)', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('deduplicates three vessel rows for the same emailId|itemIndex to exactly one', () => {
    const blob = buildDemoSessionBlob(db);
    const matches = blob.parsedVessels.filter(
      (v) => v.emailId === EMAIL_ID && v.itemIndex === ITEM_INDEX,
    );
    expect(matches).toHaveLength(1);
  });

  it('display path and scoring path resolve to the same record', () => {
    const blob = buildDemoSessionBlob(db);
    const displayRecord = blob.parsedVessels.find(
      (v) => v.emailId === EMAIL_ID && v.itemIndex === ITEM_INDEX,
    );
    const scoringRecord = new Map(
      blob.parsedVessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]),
    ).get(`${EMAIL_ID}|${ITEM_INDEX}`);
    expect(displayRecord).toBeDefined();
    expect(scoringRecord).toBeDefined();
    expect(displayRecord).toEqual(scoringRecord);
  });

  it('first-row value preserved: grainCapacity=3994, grainCapacityUnit forced to cbm', () => {
    const blob = buildDemoSessionBlob(db);
    const vessel = blob.parsedVessels.find(
      (v) => v.emailId === EMAIL_ID && v.itemIndex === ITEM_INDEX,
    )!;
    expect(vessel.grainCapacity).toBe(3994);
    expect(vessel.grainCapacityUnit).toBe('cbm');
  });

  it('scoreVolume with corrected 3994 cbm capacity does NOT overflow for HRC 115 MT', () => {
    const blob = buildDemoSessionBlob(db);
    const vessel = blob.parsedVessels.find(
      (v) => v.emailId === EMAIL_ID && v.itemIndex === ITEM_INDEX,
    )!;
    const result = scoreVolume(115, 'grain', vessel.grainCapacity ?? null, null);
    expect(result.rationale).not.toContain('overflows the holds');
  });
});
