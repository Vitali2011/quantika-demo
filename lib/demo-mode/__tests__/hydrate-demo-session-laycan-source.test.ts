/**
 * Regression test (#1024): the hydrate path (PROD login) must strip
 * preferredDates.sourceText so a synthesized/shifted laycan does NOT render a
 * false [¹] Source-Attribution footnote.
 *
 * Two write-paths exist:
 *   - createDemoSession → rebaseParsedCargoes (dropLaycanSource) — already strips.
 *   - hydrateDemoSession → buildDemoSessionBlob — loaded parsed_results AS-IS and
 *     preserved the original email date quote (sourceText), while the displayed
 *     laycan is the synthesized value → false [¹].
 *
 * After Fix A both paths behave the same: preferredDates.sourceText === undefined.
 */
import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '../hydrate-demo-session';

const EMAIL_ID = '19e0cafef00dba1';
const ITEM_INDEX = 0;

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
    VALUES ('demo',?,?,?,?,?,'me@demo.local','Cargo Nemrut/Berbera','2026-05-20','L/C 07/10 May','snip','["INBOX"]',0)`)
    .run(EMAIL_ID, `t-${EMAIL_ID}`, `Sender <sender@demo.local>`, 'Sender', 'sender@demo.local');

  // A cargo whose preferredDates carries the ORIGINAL email date quote in
  // sourceText ('07/10 May') while .value is the synthesized/shifted laycan.
  const cargoRow = JSON.stringify([{
    emailId: EMAIL_ID, itemIndex: ITEM_INDEX,
    cargoDescription: '2,800 mt steel',
    laycan: '2026-06-03 to 2026-06-06',
    preferredDates: {
      value: '2026-06-03 to 2026-06-06',
      confidence: 'confirmed',
      sourceText: '07/10 May',
    },
  }]);

  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at) VALUES ('demo',?,?,?,?,?)`)
    .run(EMAIL_ID, 'cargo', 'v1', cargoRow, 0);

  return db;
}

describe('buildDemoSessionBlob — strip false laycan [¹] footnote (#1024)', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('drops preferredDates.sourceText for a shifted laycan (no false [¹])', () => {
    const blob = buildDemoSessionBlob(db);
    const cargo = blob.parsedCargos.find(
      (c) => c.emailId === EMAIL_ID && c.itemIndex === ITEM_INDEX,
    );
    expect(cargo).toBeDefined();
    expect(cargo!.preferredDates).not.toBeNull();
    // sourceText stripped → SourceAttributionSection renders no [¹] for laycan.
    expect(cargo!.preferredDates!.sourceText).toBeUndefined();
    // displayed value is preserved.
    expect(cargo!.preferredDates!.value).toBe('2026-06-03 to 2026-06-06');
  });
});
