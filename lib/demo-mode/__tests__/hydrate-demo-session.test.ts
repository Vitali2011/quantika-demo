import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '../hydrate-demo-session';
import { logger } from '@/lib/logger';

function makeSeedDb(): Database.Database {
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
    VALUES ('demo','e1','t1','From A <a@demo.local>','A','a@demo.local','me@demo.local','Cargo X','2026-05-20','body1','snip1','["INBOX"]',0)`).run();
  db.prepare(`INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email, to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES ('demo','e2','t2','From B <b@demo.local>','B','b@demo.local','me@demo.local','Vessel Y','2026-05-21','body2','snip2',NULL,0)`).run();
  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES ('demo','e1','cargo','v1','[{"emailId":"e1","itemIndex":0}]',0)`).run();
  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES ('demo','e2','vessel','v1','[{"emailId":"e2","itemIndex":0}]',0)`).run();
  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES ('demo','e1','classify','v1','[{"emailId":"e1","category":"CARGO_INQUIRY","isUnanswered":false,"urgency":"normal","daysWithoutReply":null,"confidence":0.9,"originalSender":"A","originalSenderCompany":"ACME"}]',0)`).run();
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured)
    VALUES ('e1','e2',88,'Good fit','shortlist',NULL,0,0,NULL)`).run();
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured)
    VALUES ('e1','e2b',66,'Possible fit','shortlist',NULL,0,0,NULL)`).run();
  // A per-session copy (user_id != NULL), as persistSessionMatches writes on prod.
  // buildDemoSessionBlob must IGNORE these and read only the seeded (NULL) rows.
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured)
    VALUES ('e1','e2',88,'session copy','shortlist','sess-xyz',0,0,NULL)`).run();
  return db;
}

describe('buildDemoSessionBlob', () => {
  it('maps emails, parsed_results, and matches into the session blob', () => {
    const db = makeSeedDb();
    const blob = buildDemoSessionBlob(db);

    expect(blob.emails).toHaveLength(2);
    expect(blob.emails[0]).toMatchObject({ id: 'e1', threadId: 't1', fromName: 'A', labelIds: ['INBOX'] });
    expect(blob.emails[1].labelIds).toEqual([]); // NULL label_ids -> []
    expect(blob.parsedCargos).toHaveLength(1);
    expect(blob.parsedVessels).toHaveLength(1);
    expect(blob.classifications).toHaveLength(1);
    expect(blob.matches).toHaveLength(2); // only seeded (user_id NULL) rows; the session copy is excluded
    expect(blob.matches.every((m) => m.matchReasons[0] !== 'session copy')).toBe(true);
    expect(blob.matches[0]).toMatchObject({
      cargoEmailId: 'e1', cargoItemIndex: 0, vesselEmailId: 'e2',
      vesselItemIndex: 0, score: 88, matchLevel: 'good', matchReasons: ['Good fit'],
    });
    expect(blob.matches[1].matchLevel).toBe('possible'); // 66 -> possible
    expect(blob.isSampleData).toBe(true);
    expect(blob.accountId).toBe('demo');
    db.close();
  });

  it('skips a malformed result_json row but keeps the valid rows (and warns)', () => {
    const db = makeSeedDb();
    db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
      VALUES ('demo','e1','cargo','v1','{not json',0)`).run();
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation((() => {}) as never);

    const blob = buildDemoSessionBlob(db);

    // The valid cargo row from makeSeedDb survives; only the malformed row is skipped.
    expect(blob.parsedCargos).toHaveLength(1);
    // The bad row was logged rather than thrown.
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    db.close();
  });
});
