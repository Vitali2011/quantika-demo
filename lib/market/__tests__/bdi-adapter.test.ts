/**
 * Behavioral tests for lib/market/bdi-adapter.ts
 *
 * PI2: calls parseBdiCsv() / parseBdiHtml() with real input (not string-match only).
 * parseBdiCsv tests use inline CSV (stooq legacy path, kept for coverage).
 * parseBdiHtml + refreshBdi tests use FIXTURE_HTML mirroring handybulk.com format.
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import { parseBdiCsv, parseBdiHtml, refreshBdi, BdiStructureChangedError } from '../bdi-adapter';
import { getLatestBalticIndex } from '../baltic-repository';

const FIXTURE_CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-05-26,1440,1465,1425,1455,0',
  '2026-05-23,1410,1445,1405,1440,0',
].join('\n');

// Mirrors handybulk.com/baltic-dry-index/ paragraph format. Value 1,455 / 2026-05-26
// matches the expectations carried over from FIXTURE_CSV so no assertion changes needed.
const FIXTURE_HTML = `<div>
  <p>26-May-2026</p>
  <div><p>The Baltic Dry Index (BDI) increased by 15 points to reach 1,455 points. The Baltic Handysize Index (BHSI) decreased by 2 points to 530 points.</p></div>
  <p>23-May-2026</p>
  <div><p>The Baltic Dry Index (BDI) decreased by 25 points to reach 1,440 points.</p></div>
</div>`;

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration019.up(db);
  return db;
}

describe('parseBdiCsv', () => {
  it('parses BDI Close value from fixture CSV (PI2: real parser call)', () => {
    const result = parseBdiCsv(FIXTURE_CSV);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1455);
  });

  it('parses ISO date from newest row', () => {
    const result = parseBdiCsv(FIXTURE_CSV);
    expect(result!.date).toBe('2026-05-26');
  });

  it('returns null for empty string (boundary: empty)', () => {
    expect(parseBdiCsv('')).toBeNull();
  });

  it('returns null when header has no Date column', () => {
    expect(parseBdiCsv('Open,High,Low,Close,Volume\n1440,1465,1425,1455,0')).toBeNull();
  });

  it('returns null when header has no Close column', () => {
    expect(parseBdiCsv('Date,Open,High,Low,Volume\n2026-05-26,1440,1465,1425,0')).toBeNull();
  });

  it('returns null for malformed date (MM/DD/YYYY)', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n05/26/2026,1440,1465,1425,1455,0';
    expect(parseBdiCsv(csv)).toBeNull();
  });

  it('returns null for zero Close value (boundary: zero)', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2026-05-26,0,0,0,0,0';
    expect(parseBdiCsv(csv)).toBeNull();
  });

  it('returns null when data row is absent (header-only CSV)', () => {
    expect(parseBdiCsv('Date,Open,High,Low,Close,Volume')).toBeNull();
  });
});

describe('parseBdiHtml', () => {
  it('parses BDI value from fixture HTML (PI2: real parser call)', () => {
    const result = parseBdiHtml(FIXTURE_HTML);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1455);
  });

  it('parses ISO date from DD-Month-YYYY header', () => {
    const result = parseBdiHtml(FIXTURE_HTML);
    expect(result!.date).toBe('2026-05-26');
  });

  it('returns null for empty string (boundary: empty)', () => {
    expect(parseBdiHtml('')).toBeNull();
  });

  it('returns null when no BDI paragraph is present', () => {
    expect(parseBdiHtml('<p>26-May-2026</p><p>No shipping data here.</p>')).toBeNull();
  });

  it('returns null when there is no date entry', () => {
    expect(
      parseBdiHtml('The Baltic Dry Index (BDI) rose to 2,991 points.'),
    ).toBeNull();
  });
});

describe('refreshBdi (PI2: real DB upsert)', () => {
  it('upserts BDI row into baltic_indices', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBdi(db, fakeFetcher);

    const row = getLatestBalticIndex(db, 'BDI');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(1455);
    expect(row!.price_date).toBe('2026-05-26');
    expect(row!.index_code).toBe('BDI');

    db.close();
  });

  it('is idempotent — second call with same date does not duplicate', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_HTML);

    await refreshBdi(db, fakeFetcher);
    await refreshBdi(db, fakeFetcher);

    const count = (
      db
        .prepare("SELECT COUNT(*) as n FROM baltic_indices WHERE index_code='BDI'")
        .get() as { n: number }
    ).n;
    expect(count).toBe(1);

    db.close();
  });

  it('throws BdiStructureChangedError when HTML contains no BDI entry', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue('<html><body>no data</body></html>');

    await expect(refreshBdi(db, fakeFetcher)).rejects.toThrow(BdiStructureChangedError);

    db.close();
  });

  it('propagates network errors', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(refreshBdi(db, fakeFetcher)).rejects.toThrow('Network error');

    db.close();
  });
});
