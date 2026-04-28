import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/runner';
import { allMigrations } from '../migrations/index';
import { logAuditEvent, getAuditTrail, getAuditTrailBySession } from '../audit';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, allMigrations);
});

afterEach(() => {
  db.close();
});

describe('logAuditEvent', () => {
  it('creates an entry with UUID id and ISO 8601 timestamp', () => {
    const entry = logAuditEvent(
      { sessionId: 'sess-1', actor: 'ai', action: 'parsed' },
      db,
    );
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('serializes non-string before/after values and round-trips via getAuditTrail', () => {
    logAuditEvent(
      {
        sessionId: 'sess-1',
        inquiryId: 'inq-serial',
        actor: 'user',
        action: 'overridden',
        field: 'cargo.weight_mt',
        beforeValue: { value: 100, confidence: 'confirmed' },
        afterValue: 250,
      },
      db,
    );
    const trail = getAuditTrail('inq-serial', db);
    expect(trail).toHaveLength(1);
    expect(trail[0].beforeValue).toEqual({ value: 100, confidence: 'confirmed' });
    expect(trail[0].afterValue).toBe(250);
  });

  it('returns full AuditEntry with sessionId, inquiryId and reason', () => {
    const entry = logAuditEvent(
      {
        sessionId: 'sess-2',
        inquiryId: 'inq-2',
        actor: 'system',
        action: 'sent',
        reason: 'approved by broker',
      },
      db,
    );
    expect(entry.sessionId).toBe('sess-2');
    expect(entry.inquiryId).toBe('inq-2');
    expect(entry.reason).toBe('approved by broker');
  });
});

describe('getAuditTrail', () => {
  it('returns events in ascending timestamp order (rowid tiebreak)', () => {
    logAuditEvent({ sessionId: 's1', inquiryId: 'inq-order', actor: 'ai', action: 'parsed' }, db);
    logAuditEvent({ sessionId: 's1', inquiryId: 'inq-order', actor: 'user', action: 'confirmed' }, db);
    logAuditEvent({ sessionId: 's1', inquiryId: 'inq-order', actor: 'user', action: 'overridden' }, db);

    const trail = getAuditTrail('inq-order', db);
    expect(trail).toHaveLength(3);
    expect(trail[0].action).toBe('parsed');
    expect(trail[1].action).toBe('confirmed');
    expect(trail[2].action).toBe('overridden');
  });

  it('returns empty array for unknown inquiryId', () => {
    const trail = getAuditTrail('nonexistent-inq', db);
    expect(trail).toEqual([]);
  });
});

describe('getAuditTrailBySession', () => {
  it('respects limit parameter: 5 events inserted, limit=3 returns 3 from that session', () => {
    for (let i = 0; i < 5; i++) {
      logAuditEvent(
        { sessionId: 'sess-limit', inquiryId: `inq-${i}`, actor: 'ai', action: 'parsed' },
        db,
      );
    }
    const trail = getAuditTrailBySession('sess-limit', 3, db);
    expect(trail).toHaveLength(3);
    expect(trail.every((e) => e.sessionId === 'sess-limit')).toBe(true);
  });
});
