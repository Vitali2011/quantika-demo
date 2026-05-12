import Database from 'better-sqlite3';
import migration028 from '../../migrations/028-psc-history';
import {
  getDetentionHistory,
  upsertInspection,
  getDetentionCount,
  type PscRecord,
} from '../psc-repository';

/**
 * Input Contracts tested:
 *
 * getDetentionHistory(db, imo):
 * - Empty/falsy imo ("", null, undefined) → return []
 *
 * upsertInspection(db, record):
 * - Empty/falsy id, imo → DB NOT NULL error
 * - NaN/Infinity deficiencies → guard with Number.isFinite, default to 0
 * - Negative deficiencies → store as-is (no CHECK)
 * - Invalid authority → DB CHECK constraint error
 *
 * getDetentionCount(db, imo, sinceDate):
 * - Empty/falsy imo ("", null, undefined) → return 0
 * - Empty/falsy sinceDate → return 0
 * - Invalid date format → SQL comparison fails gracefully, return 0
 */

describe('psc-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration028.up(db);
  });

  afterEach(() => {
    db.close();
  });

  // RED test: upsertInspection stores record
  it('upsertInspection stores record', () => {
    const record: PscRecord = {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 3,
      detained: true,
      source_url: 'https://example.com/p1',
    };

    upsertInspection(db, record);

    const row = db
      .prepare<[string], any>(`SELECT * FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row).toBeDefined();
    expect(row.id).toBe('p1');
    expect(row.imo).toBe('9123456');
    expect(row.inspection_date).toBe('2025-01-15');
    expect(row.port).toBe('Rotterdam');
    expect(row.authority).toBe('paris-mou');
    expect(row.deficiencies).toBe(3);
    expect(row.detained).toBe(1);
    expect(row.source_url).toBe('https://example.com/p1');
  });

  // RED test: getDetentionHistory returns records for IMO sorted by date desc
  it('getDetentionHistory returns records for IMO sorted by date desc', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-10',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: false,
      source_url: null,
    });

    upsertInspection(db, {
      id: 'p2',
      imo: '9123456',
      inspection_date: '2025-01-20',
      port: 'Hamburg',
      authority: 'tokyo-mou',
      deficiencies: 5,
      detained: true,
      source_url: 'https://example.com/p2',
    });

    upsertInspection(db, {
      id: 'p3',
      imo: '9123456',
      inspection_date: '2025-01-05',
      port: null,
      authority: 'uscg',
      deficiencies: 0,
      detained: false,
      source_url: null,
    });

    const results = getDetentionHistory(db, '9123456');

    expect(results).toHaveLength(3);
    // Check order: most recent first
    expect(results[0].inspection_date).toBe('2025-01-20');
    expect(results[1].inspection_date).toBe('2025-01-10');
    expect(results[2].inspection_date).toBe('2025-01-05');
    // Check detained boolean conversion
    expect(results[0].detained).toBe(true);
    expect(results[1].detained).toBe(false);
  });

  // RED test: getDetentionHistory returns empty for unknown IMO
  it('getDetentionHistory returns empty for unknown IMO', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-10',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: false,
      source_url: null,
    });

    const results = getDetentionHistory(db, '9999999');

    expect(results).toEqual([]);
  });

  // RED test (boundary): getDetentionHistory with empty imo
  it('getDetentionHistory returns empty for empty imo', () => {
    const results1 = getDetentionHistory(db, '');
    const results2 = getDetentionHistory(db, null as any);
    const results3 = getDetentionHistory(db, undefined as any);

    expect(results1).toEqual([]);
    expect(results2).toEqual([]);
    expect(results3).toEqual([]);
  });

  // RED test: getDetentionCount counts detained=1 records since date
  it('getDetentionCount counts detained=1 records since date', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2024-12-01',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: true,
      source_url: null,
    });

    upsertInspection(db, {
      id: 'p2',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Hamburg',
      authority: 'tokyo-mou',
      deficiencies: 5,
      detained: true,
      source_url: null,
    });

    upsertInspection(db, {
      id: 'p3',
      imo: '9123456',
      inspection_date: '2025-01-20',
      port: 'London',
      authority: 'paris-mou',
      deficiencies: 1,
      detained: false,
      source_url: null,
    });

    const count = getDetentionCount(db, '9123456', '2025-01-01');

    expect(count).toBe(1); // Only p2 is detained and after 2025-01-01
  });

  // RED test (boundary): getDetentionCount with empty inputs
  it('getDetentionCount returns 0 for empty imo or sinceDate', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: true,
      source_url: null,
    });

    expect(getDetentionCount(db, '', '2025-01-01')).toBe(0);
    expect(getDetentionCount(db, '9123456', '')).toBe(0);
    expect(getDetentionCount(db, null as any, '2025-01-01')).toBe(0);
    expect(getDetentionCount(db, '9123456', null as any)).toBe(0);
  });

  // RED test (boundary): getDetentionCount with invalid date format
  it('getDetentionCount returns 0 for invalid date format', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: true,
      source_url: null,
    });

    const count = getDetentionCount(db, '9123456', 'invalid-date');

    expect(count).toBe(0);
  });

  // RED test: upsertInspection ON CONFLICT updates existing
  it('upsertInspection ON CONFLICT updates existing record', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 2,
      detained: false,
      source_url: null,
    });

    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Hamburg',
      authority: 'tokyo-mou',
      deficiencies: 5,
      detained: true,
      source_url: 'https://example.com/updated',
    });

    const row = db
      .prepare<[string], any>(`SELECT * FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row.port).toBe('Hamburg');
    expect(row.authority).toBe('tokyo-mou');
    expect(row.deficiencies).toBe(5);
    expect(row.detained).toBe(1);
    expect(row.source_url).toBe('https://example.com/updated');

    const allRows = db
      .prepare<[], any>(`SELECT * FROM psc_detention_history`)
      .all();
    expect(allRows).toHaveLength(1); // No duplicate
  });

  // RED test (boundary): invalid authority fails CHECK constraint
  it('upsertInspection throws for invalid authority', () => {
    expect(() => {
      upsertInspection(db, {
        id: 'p1',
        imo: '9123456',
        inspection_date: '2025-01-15',
        port: 'Rotterdam',
        authority: 'invalid-authority' as any,
        deficiencies: 2,
        detained: false,
        source_url: null,
      });
    }).toThrow(/CHECK constraint/i);
  });

  // boundary: negative deficiencies are clamped to 0 (QA fix C-01)
  it('upsertInspection clamps negative deficiencies to 0', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: -5,
      detained: false,
      source_url: null,
    });

    const row = db
      .prepare<[string], any>(`SELECT deficiencies FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row.deficiencies).toBe(0);
  });

  // RED test (boundary): NaN deficiencies → guard with Number.isFinite, default to 0
  it('upsertInspection guards against NaN deficiencies', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: NaN,
      detained: false,
      source_url: null,
    });

    const row = db
      .prepare<[string], any>(`SELECT deficiencies FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row.deficiencies).toBe(0);
  });

  // RED test (boundary): Infinity deficiencies → guard with Number.isFinite, default to 0
  it('upsertInspection guards against Infinity deficiencies', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: Infinity,
      detained: false,
      source_url: null,
    });

    const row = db
      .prepare<[string], any>(`SELECT deficiencies FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row.deficiencies).toBe(0);
  });

  // RED test (boundary): -Infinity deficiencies → guard with Number.isFinite, default to 0
  it('upsertInspection guards against -Infinity deficiencies', () => {
    upsertInspection(db, {
      id: 'p1',
      imo: '9123456',
      inspection_date: '2025-01-15',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: -Infinity,
      detained: false,
      source_url: null,
    });

    const row = db
      .prepare<[string], any>(`SELECT deficiencies FROM psc_detention_history WHERE id = ?`)
      .get('p1');

    expect(row.deficiencies).toBe(0);
  });
});
